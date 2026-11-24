import "server-only";
import type { EnrollmentStatus, LessonType, Prisma, VideoProvider } from "@prisma/client";
import { bunnyEmbedUrl, isBunnyConfigured } from "@/lib/bunny";
import { issueCertificate } from "@/lib/certificates";
import { prisma } from "@/lib/db";
import { vnIsoDate } from "@/lib/format";
import { applySequence, DOCUMENT_MIN_SECONDS } from "@/lib/learning-sequence";
import { notify } from "@/lib/notifications";
import { getPathLock, getPathLocks, loadPathCourses, lockKey, type PathLock } from "@/lib/path-lock";
import { isBlankHtml, sanitizeLessonHtml } from "@/lib/sanitize";

/**
 * Dữ liệu học của CHÍNH người đăng nhập (docs/database.md — Quy tắc 3, 4). Chỉ chạy ở server.
 * Mọi hàm nhận `userId` của người đang đăng nhập và lọc theo đó NGAY TRONG truy vấn.
 * Việc 15 (trình học) dùng lại getCourseOutline để mở / khoá bài.
 */

// ---------------------------------------------------------------------------------------------
// Mục lục + học tuần tự

export type OutlineLesson = {
  id: string;
  title: string;
  type: LessonType;
  /** Video: thời lượng (giây); loại khác null */
  durationSeconds: number | null;
  completed: boolean;
  /** Có tiến độ nhưng chưa xong */
  inProgress: boolean;
  /** Chưa mở được: bài liền trước (xuyên chương) chưa xong */
  locked: boolean;
};

export type OutlineSection = { id: string; title: string; lessons: OutlineLesson[] };

export type CourseOutline = {
  sections: OutlineSection[];
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  totalVideoSeconds: number;
  /** Bài đầu tiên chưa xong và đang mở (null = đã xong hết hoặc khoá chưa có bài) */
  nextLessonId: string | null;
  firstLessonId: string | null;
  /** Khoá bị 🔒 theo lộ trình (Việc 23B): mọi bài khoá, phải học xong khoá trước */
  pathLock: PathLock | null;
};

/** Chương / bài đang hiện (bỏ isArchived; chương ẩn = bỏ cả bài), theo thứ tự. */
async function visibleStructure(courseIds: string[]) {
  return prisma.courseSection.findMany({
    where: { courseId: { in: courseIds }, isArchived: false },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      courseId: true,
      title: true,
      lessons: {
        where: { isArchived: false },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true, title: true, type: true, durationSeconds: true },
      },
    },
  });
}

export async function getCourseOutline(userId: string, courseId: string): Promise<CourseOutline> {
  const [sections, pathLock] = await Promise.all([visibleStructure([courseId]), getPathLock(userId, courseId)]);
  const lessonIds = sections.flatMap((s) => s.lessons.map((l) => l.id));
  const progress = lessonIds.length
    ? await prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: lessonIds } },
        select: { lessonId: true, isCompleted: true },
      })
    : [];
  const progressOf = new Map(progress.map((p) => [p.lessonId, p]));

  const flat = applySequence(
    sections.flatMap((s) =>
      s.lessons.map((l) => {
        const p = progressOf.get(l.id);
        return {
          id: l.id,
          sectionId: s.id,
          title: l.title,
          type: l.type,
          durationSeconds: l.type === "VIDEO" ? l.durationSeconds : null,
          completed: !!p?.isCompleted,
          inProgress: !!p && !p.isCompleted,
        };
      }),
    ),
  );

  const completedLessons = flat.filter((l) => l.completed).length;
  return {
    sections: sections.map((s) => ({
      id: s.id,
      title: s.title,
      lessons: flat
        .filter((l) => l.sectionId === s.id)
        .map((l) => ({
          id: l.id,
          title: l.title,
          type: l.type,
          durationSeconds: l.durationSeconds,
          completed: l.completed,
          inProgress: l.inProgress,
          locked: l.locked || !!pathLock,
        })),
    })),
    totalLessons: flat.length,
    completedLessons,
    progressPercent: flat.length ? Math.round((completedLessons / flat.length) * 100) : 0,
    totalVideoSeconds: flat.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0),
    nextLessonId: pathLock ? null : (flat.find((l) => !l.completed && !l.locked)?.id ?? null),
    firstLessonId: flat[0]?.id ?? null,
    pathLock,
  };
}

/** nextLessonId (hoặc bài đầu nếu đã xong hết) cho nhiều khoá cùng lúc — 2 truy vấn, không N+1. */
export async function getNextLessonIds(userId: string, courseIds: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (courseIds.length === 0) return result;
  const sections = await visibleStructure(courseIds);
  const lessonIds = sections.flatMap((s) => s.lessons.map((l) => l.id));
  const done = new Set(
    (
      await prisma.lessonProgress.findMany({
        where: { userId, lessonId: { in: lessonIds }, isCompleted: true },
        select: { lessonId: true },
      })
    ).map((p) => p.lessonId),
  );
  for (const courseId of courseIds) {
    const flat = applySequence(
      sections.filter((s) => s.courseId === courseId).flatMap((s) => s.lessons.map((l) => ({ id: l.id, completed: done.has(l.id) }))),
    );
    result.set(courseId, flat.find((l) => !l.completed && !l.locked)?.id ?? flat[0]?.id ?? null);
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Lượt học của tôi

export const MY_TABS = ["all", "inProgress", "notStarted", "completed", "overdue"] as const;
export type MyTab = (typeof MY_TABS)[number];

export type MyFilters = { tab?: MyTab; q?: string; categoryId?: string };

const OPEN: EnrollmentStatus[] = ["NOT_STARTED", "IN_PROGRESS"];

function baseWhere(userId: string, f: MyFilters): Prisma.EnrollmentWhereInput {
  return {
    userId,
    status: { not: "CANCELLED" },
    ...((f.q || f.categoryId) && {
      course: {
        ...(f.q && { title: { contains: f.q, mode: "insensitive" as const } }),
        ...(f.categoryId && { categoryId: f.categoryId }),
      },
    }),
  };
}

function tabWhere(tab: MyTab, now: Date): Prisma.EnrollmentWhereInput {
  switch (tab) {
    case "inProgress":
      return { status: "IN_PROGRESS" };
    case "notStarted":
      return { status: "NOT_STARTED" };
    case "completed":
      return { status: "COMPLETED" };
    case "overdue":
      return { status: { in: OPEN }, dueDate: { lt: now } };
    default:
      return {};
  }
}

const ENROLLMENT_SELECT = {
  id: true,
  status: true,
  learningPathId: true,
  source: true,
  progressPercent: true,
  dueDate: true,
  createdAt: true,
  completedAt: true,
  course: {
    select: {
      id: true,
      code: true,
      title: true,
      thumbnailUrl: true,
      categoryId: true,
      status: true,
      category: { select: { name: true } },
    },
  },
} satisfies Prisma.EnrollmentSelect;

export type MyEnrollment = Prisma.EnrollmentGetPayload<{ select: typeof ENROLLMENT_SELECT }> & { overdue: boolean };

export async function getMyEnrollments(userId: string, f: MyFilters = {}): Promise<MyEnrollment[]> {
  const now = new Date();
  const rows = await prisma.enrollment.findMany({
    where: { AND: [baseWhere(userId, f), tabWhere(f.tab ?? "all", now)] },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
    select: ENROLLMENT_SELECT,
  });
  const withFlag = rows.map((r) => ({ ...r, overdue: !!r.dueDate && r.dueDate < now && OPEN.includes(r.status) }));
  // Quá hạn lên đầu; đã hoàn thành xuống cuối; còn lại theo hạn gần nhất
  const rank = (e: MyEnrollment) => (e.overdue ? 0 : e.status === "COMPLETED" ? 2 : 1);
  return withFlag.sort((a, b) => rank(a) - rank(b));
}

export async function getMyEnrollmentCounts(userId: string, f: Omit<MyFilters, "tab"> = {}): Promise<Record<MyTab, number>> {
  const now = new Date();
  const base = baseWhere(userId, f);
  const counts = await Promise.all(MY_TABS.map((tab) => prisma.enrollment.count({ where: { AND: [base, tabWhere(tab, now)] } })));
  return Object.fromEntries(MY_TABS.map((tab, i) => [tab, counts[i]])) as Record<MyTab, number>;
}

export async function getMyStats(userId: string) {
  const now = new Date();
  const [inProgress, notStarted, completed, overdue, certificates] = await Promise.all([
    prisma.enrollment.count({ where: { userId, status: "IN_PROGRESS" } }),
    prisma.enrollment.count({ where: { userId, status: "NOT_STARTED" } }),
    prisma.enrollment.count({ where: { userId, status: "COMPLETED" } }),
    prisma.enrollment.count({ where: { userId, status: { in: OPEN }, dueDate: { lt: now } } }),
    prisma.certificate.count({
      where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    }),
  ]);
  return { inProgress, notStarted, completed, overdue, certificates };
}

/** “Cần làm”: khoá chưa xong, hạn gần nhất trước (không hạn xếp cuối). Bỏ khoá đang 🔒 theo lộ trình. */
export async function getTodoEnrollments(userId: string, take = 5): Promise<MyEnrollment[]> {
  const now = new Date();
  const rows = await prisma.enrollment.findMany({
    where: { userId, status: { in: OPEN } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: ENROLLMENT_SELECT,
  });
  const locks = await getPathLocks(rows.map((r) => ({ userId, courseId: r.course.id, learningPathId: r.learningPathId })));
  return rows
    .filter((r) => !locks.has(lockKey(userId, r.course.id)))
    .slice(0, take)
    .map((r) => ({ ...r, overdue: !!r.dueDate && r.dueDate < now }));
}

/** “Tiếp tục học”: bài đang học dở mới nhất (bài + chương không ẩn, lượt học còn hiệu lực). */
export async function getContinueLearning(userId: string, take = 3) {
  const rows = await prisma.lessonProgress.findMany({
    where: {
      userId,
      isCompleted: false,
      lesson: {
        isArchived: false,
        section: { isArchived: false, course: { enrollments: { some: { userId, status: { not: "CANCELLED" } } } } },
      },
    },
    // id: thứ tự xác định khi 2 bài cùng thời điểm cập nhật (Việc 30 — kế hoạch truy vấn đổi theo index không làm đảo thứ tự)
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take,
    select: {
      updatedAt: true,
      lesson: {
        select: {
          id: true,
          title: true,
          type: true,
          section: { select: { course: { select: { id: true, title: true, thumbnailUrl: true, categoryId: true } } } },
        },
      },
    },
  });
  const courseIds = [...new Set(rows.map((r) => r.lesson.section.course.id))];
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: courseIds } },
    select: { courseId: true, progressPercent: true },
  });
  const progressOf = new Map(enrollments.map((e) => [e.courseId, e.progressPercent]));
  return rows.map((r) => ({
    lessonId: r.lesson.id,
    lessonTitle: r.lesson.title,
    lessonType: r.lesson.type,
    course: r.lesson.section.course,
    progressPercent: progressOf.get(r.lesson.section.course.id) ?? 0,
    updatedAt: r.updatedAt,
  }));
}

/** Lượt học còn hiệu lực (khác CANCELLED) của chính mình cho 1 khoá — null nếu không có. */
export async function getMyEnrollment(userId: string, courseId: string) {
  if (!courseId || courseId.length > 50) return null;
  return prisma.enrollment.findFirst({
    where: { userId, courseId, status: { not: "CANCELLED" } },
    select: {
      ...ENROLLMENT_SELECT,
      completedVersion: true,
      acknowledgedVersion: true,
      acknowledgedAt: true,
      course: {
        select: {
          ...ENROLLMENT_SELECT.course.select,
          description: true,
          currentVersion: true,
        },
      },
    },
  });
}

/** Số ngày còn lại tới hạn (theo ngày giờ VN): âm = đã quá hạn bấy nhiêu ngày, 0 = hạn hôm nay. */
export function daysUntil(due: Date): number {
  const today = vnIsoDate();
  const dueDay = vnIsoDate(due);
  const ms = new Date(`${dueDay}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000);
}

/** Nhãn hạn: “Quá hạn N ngày” (đỏ) / “Còn N ngày” (cam khi ≤ 3) / null nếu còn xa hoặc không hạn. */
export function dueHint(due: Date | null, overdue: boolean): { text: string; tone: "destructive" | "warning" } | null {
  if (!due) return null;
  const d = daysUntil(due);
  if (overdue) return { text: d < 0 ? `Quá hạn ${-d} ngày` : "Quá hạn", tone: "destructive" };
  if (d <= 3) return { text: d === 0 ? "Hạn hôm nay" : `Còn ${d} ngày`, tone: "warning" };
  return null;
}


// ---------------------------------------------------------------------------------------------
// Trang học (Việc 15)

export type LessonAccess =
  | { ok: false; reason: "enrollment" | "lesson" }
  | { ok: false; reason: "path"; pathId: string }
  | {
      ok: true;
      enrollment: { id: string; status: EnrollmentStatus };
      outline: CourseOutline;
      lesson: OutlineLesson;
      /** Vị trí bài trong mục lục phẳng (0-based) */
      index: number;
    };

/**
 * Được học bài này không: có lượt học (khác CANCELLED) + bài thuộc khoá, chưa ẩn + không bị khoá tuần tự.
 * reason = "enrollment" → không có lượt học; "lesson" → bài không hợp lệ / chưa mở; "path" → khoá 🔒 theo lộ trình.
 */
export async function getLessonAccess(userId: string, courseId: string, lessonId: string): Promise<LessonAccess> {
  if (!courseId || courseId.length > 50) return { ok: false, reason: "enrollment" };
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, courseId, status: { not: "CANCELLED" } },
    select: { id: true, status: true },
  });
  if (!enrollment) return { ok: false, reason: "enrollment" };
  if (!lessonId || lessonId.length > 50) return { ok: false, reason: "lesson" };

  const outline = await getCourseOutline(userId, courseId);
  if (outline.pathLock) return { ok: false, reason: "path", pathId: outline.pathLock.pathId };
  const flat = outline.sections.flatMap((s) => s.lessons);
  const index = flat.findIndex((l) => l.id === lessonId);
  if (index < 0 || flat[index].locked) return { ok: false, reason: "lesson" };
  return { ok: true, enrollment, outline, lesson: flat[index], index };
}

/** Khoá học chứa bài (null = không có bài). */
export async function getCourseIdOfLesson(lessonId: string): Promise<string | null> {
  if (!lessonId || lessonId.length > 50) return null;
  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { section: { select: { courseId: true } } } });
  return lesson?.section.courseId ?? null;
}

export type LessonDetail =
  | {
      type: "VIDEO";
      id: string;
      title: string;
      provider: VideoProvider | null;
      videoId: string | null;
      durationSeconds: number | null;
      minWatchPercent: number;
      /** Bunny: URL nhúng kèm token, tạo mỗi lần mở trang */
      embedUrl: string | null;
      /** Lý do chưa phát / chưa tính hoàn thành được (null = phát được) */
      unavailable: string | null;
    }
  | { type: "DOCUMENT"; id: string; title: string; html: string; fileKey: string | null; fileName: string | null }
  | {
      type: "QUIZ";
      id: string;
      title: string;
      questionCount: number | null;
      passingScore: number | null;
      timeLimitMinutes: number | null;
      maxAttempts: number | null;
    };

/** Dữ liệu hiển thị 1 bài (dùng chung cho trang học và tab Xem trước). Gọi SAU khi đã kiểm tra quyền. */
export async function getLessonDetail(lessonId: string): Promise<LessonDetail | null> {
  const l = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: {
      id: true,
      title: true,
      type: true,
      videoProvider: true,
      videoId: true,
      videoStatus: true,
      durationSeconds: true,
      minWatchPercent: true,
      content: true,
      fileUrl: true,
      fileName: true,
      questionCount: true,
      passingScore: true,
      timeLimitMinutes: true,
      maxAttempts: true,
    },
  });
  if (!l) return null;

  if (l.type === "DOCUMENT") {
    // Nội dung đã lọc khi lưu (Việc 11) — lọc lại lần nữa cho chắc trước khi đưa ra trình duyệt
    const html = l.content && !isBlankHtml(l.content) ? sanitizeLessonHtml(l.content) : "";
    return { type: "DOCUMENT", id: l.id, title: l.title, html, fileKey: l.fileUrl, fileName: l.fileName };
  }
  if (l.type === "QUIZ") {
    return {
      type: "QUIZ",
      id: l.id,
      title: l.title,
      questionCount: l.questionCount,
      passingScore: l.passingScore,
      timeLimitMinutes: l.timeLimitMinutes,
      maxAttempts: l.maxAttempts,
    };
  }

  let unavailable: string | null = null;
  if (!l.videoProvider || !l.videoId) unavailable = "Bài học chưa có video.";
  else if (l.videoStatus !== "READY") unavailable = "Video đang được xử lý, vui lòng quay lại sau.";
  else if (!l.durationSeconds) unavailable = "Video chưa có thời lượng — liên hệ người soạn khoá học.";
  else if (l.videoProvider === "BUNNY" && !(await isBunnyConfigured())) unavailable = "Hệ thống chưa cấu hình Bunny Stream.";

  return {
    type: "VIDEO",
    id: l.id,
    title: l.title,
    provider: l.videoProvider,
    videoId: l.videoId,
    durationSeconds: l.durationSeconds,
    minWatchPercent: l.minWatchPercent,
    embedUrl: !unavailable && l.videoProvider === "BUNNY" && l.videoId ? await bunnyEmbedUrl(l.videoId) : null,
    unavailable,
  };
}

/** Mục lục cho tab Xem trước: như học viên thấy (bỏ bài / chương ẩn) nhưng mọi bài đều mở, không có tiến độ. */
export async function getPreviewOutline(courseId: string): Promise<CourseOutline> {
  const sections = await visibleStructure([courseId]);
  const out: OutlineSection[] = sections.map((s) => ({
    id: s.id,
    title: s.title,
    lessons: s.lessons.map((l) => ({
      id: l.id,
      title: l.title,
      type: l.type,
      durationSeconds: l.type === "VIDEO" ? l.durationSeconds : null,
      completed: false,
      inProgress: false,
      locked: false,
    })),
  }));
  const flat = out.flatMap((s) => s.lessons);
  return {
    sections: out,
    totalLessons: flat.length,
    completedLessons: 0,
    progressPercent: 0,
    totalVideoSeconds: flat.reduce((sum, l) => sum + (l.durationSeconds ?? 0), 0),
    nextLessonId: flat[0]?.id ?? null,
    firstLessonId: flat[0]?.id ?? null,
    pathLock: null,
  };
}

/**
 * Mở bài (gọi ở trang học, sau khi đã kiểm tra quyền):
 * - Lượt học NOT_STARTED → IN_PROGRESS + startedAt (updateMany có điều kiện → mở 2 tab cùng lúc không ghi đè).
 * - Bài VIDEO / TÀI LIỆU chưa xong → tạo / chạm lesson_progress (updatedAt = lúc mở): mốc để chặn gửi số giả
 *   và đếm 15 giây của bài tài liệu; bài cũng hiện ở “Tiếp tục học”.
 */
export async function startLearning(userId: string, enrollmentId: string, lesson: Pick<OutlineLesson, "id" | "type" | "completed">) {
  const now = new Date();
  await prisma.enrollment.updateMany({
    where: { id: enrollmentId, userId, status: "NOT_STARTED" },
    data: { status: "IN_PROGRESS", startedAt: now },
  });
  if (!lesson.completed && lesson.type !== "QUIZ") {
    await prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      create: { userId, lessonId: lesson.id },
      update: { updatedAt: now },
    });
  }
}

export async function getLessonProgress(userId: string, lessonId: string) {
  return prisma.lessonProgress.findUnique({
    where: { userId_lessonId: { userId, lessonId } },
    select: { isCompleted: true, lastPositionSeconds: true, maxWatchedSeconds: true, updatedAt: true },
  });
}

export type LessonCompletion = {
  lessonId: string;
  progressPercent: number;
  /** Khoá VỪA hoàn thành ở lần này (hiện màn hình chúc mừng) */
  courseCompleted: boolean;
  completedAt: string | null;
  /** Chứng nhận vừa cấp khi hoàn thành khoá (null = khoá không cấp chứng nhận) */
  certificateId?: string | null;
  /** Lộ trình: khoá tiếp theo vừa được mở (nút “Học khoá tiếp theo”) */
  nextCourse?: { id: string; title: string } | null;
};

/**
 * Việc 22: cấp chứng nhận (khoá có hasCertificate); Việc 23: mở khoá tiếp theo trong lộ trình.
 * Chạy TRONG transaction hoàn thành khoá. Trả id chứng nhận (nếu có).
 */
async function onCourseCompleted(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
): Promise<{ certificateId: string | null; nextCourse: { id: string; title: string } | null }> {
  const certificate = await issueCertificate(tx, enrollmentId);
  const nextCourse = await onPathCourseCompleted(tx, enrollmentId);
  return { certificateId: certificate?.id ?? null, nextCourse };
}

/**
 * Việc 23B — khoá thuộc lộ trình vừa xong: khoá kế tiếp (người đó có lượt học, chưa xong) vừa hết 🔒 -> PATH_NEXT_UNLOCKED;
 * mọi khoá của lộ trình (người đó có lượt học) đã xong -> PATH_COMPLETED. Trả khoá vừa mở (nếu có).
 */
async function onPathCourseCompleted(tx: Prisma.TransactionClient, enrollmentId: string): Promise<{ id: string; title: string } | null> {
  const e = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, select: { userId: true, courseId: true, learningPathId: true } });
  if (!e.learningPathId) return null;
  const path = (await loadPathCourses([e.learningPathId], tx)).get(e.learningPathId);
  if (!path) return null;

  const mine = await tx.enrollment.findMany({
    where: { userId: e.userId, courseId: { in: path.courses.map((c) => c.id) }, status: { not: "CANCELLED" } },
    select: { courseId: true, status: true },
  });
  const statusOf = new Map(mine.map((m) => [m.courseId, m.status]));
  const steps = path.courses.filter((c) => statusOf.has(c.id));
  const firstOpen = steps.find((c) => statusOf.get(c.id) !== "COMPLETED");

  if (!firstOpen) {
    await notify(tx, {
      userIds: [e.userId],
      type: "PATH_COMPLETED",
      title: `Chúc mừng! Bạn đã hoàn thành lộ trình “${path.title}”`.slice(0, 250),
      link: `/learning-paths/${path.id}`,
      dedupeKey: `path_done:${path.id}`,
    });
    return null;
  }
  // Khoá chưa xong đầu tiên nằm SAU khoá vừa xong -> vừa được mở
  const doneIndex = steps.findIndex((c) => c.id === e.courseId);
  if (steps.indexOf(firstOpen) <= doneIndex) return null;
  await notify(tx, {
    userIds: [e.userId],
    type: "PATH_NEXT_UNLOCKED",
    title: `Đã mở khoá học tiếp theo: “${firstOpen.title}” (lộ trình “${path.title}”)`.slice(0, 250),
    link: `/my-courses/${firstOpen.id}`,
    dedupeKey: `path_next:${path.id}:${firstOpen.id}`,
  });
  return firstOpen;
}

/**
 * Hoàn thành 1 bài (dùng chung cho video, tài liệu, sau này bài kiểm tra) — 1 transaction:
 * đánh dấu bài xong (đã xong thì giữ nguyên) → tính lại progressPercent = bài xong ÷ bài đang dùng × 100
 * → đủ 100% thì lượt học COMPLETED + completedVersion = acknowledgedVersion = currentVersion (Quy tắc 2).
 * Gọi SAU khi đã kiểm tra quyền (getLessonAccess).
 */
export async function completeLesson(userId: string, lessonId: string): Promise<LessonCompletion> {
  return prisma.$transaction(async (tx) => {
    const lesson = await tx.lesson.findUniqueOrThrow({
      where: { id: lessonId },
      select: { section: { select: { courseId: true, course: { select: { currentVersion: true } } } } },
    });
    const courseId = lesson.section.courseId;
    const enrollment = await tx.enrollment.findFirstOrThrow({
      where: { userId, courseId, status: { not: "CANCELLED" } },
      select: { id: true, status: true, completedAt: true },
    });
    const now = new Date();

    const existing = await tx.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId } },
      select: { id: true, isCompleted: true },
    });
    if (!existing) {
      await tx.lessonProgress.create({ data: { userId, lessonId, isCompleted: true, completedAt: now } });
    } else if (!existing.isCompleted) {
      await tx.lessonProgress.update({ where: { id: existing.id }, data: { isCompleted: true, completedAt: now } });
    }

    // Chỉ tính bài đang dùng (bài + chương chưa ẩn)
    const visible: Prisma.LessonWhereInput = { isArchived: false, section: { courseId, isArchived: false } };
    const total = await tx.lesson.count({ where: visible });
    const done = await tx.lessonProgress.count({ where: { userId, isCompleted: true, lesson: visible } });
    const progressPercent = total ? Math.round((done / total) * 100) : 0;

    // Đã hoàn thành khoá từ trước (xem lại) → không đổi lượt học
    if (enrollment.status === "COMPLETED") {
      return { lessonId, progressPercent, courseCompleted: false, completedAt: enrollment.completedAt?.toISOString() ?? null };
    }

    const finished = total > 0 && done >= total;
    const version = lesson.section.course.currentVersion;
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        progressPercent,
        ...(enrollment.status === "NOT_STARTED" && { status: "IN_PROGRESS", startedAt: now }),
        ...(finished && {
          status: "COMPLETED",
          completedAt: now,
          completedVersion: version,
          acknowledgedVersion: version,
          acknowledgedAt: now,
        }),
      },
    });
    const hook = finished ? await onCourseCompleted(tx, enrollment.id) : null;

    return {
      lessonId,
      progressPercent,
      courseCompleted: finished,
      completedAt: finished ? now.toISOString() : null,
      certificateId: hook?.certificateId ?? null,
      nextCourse: hook?.nextCourse ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Học lại (Việc 20: chứng nhận hết hạn; Việc 21: bản MAJOR)

export type RelearnReason = "CERTIFICATE_EXPIRED" | "VERSION_MAJOR";

/**
 * Đặt lại 1 lượt học để HỌC LẠI từ đầu (chạy trong transaction của người gọi):
 * - enrollment → NOT_STARTED, progressPercent 0, startedAt / completedAt = null, hạn mới.
 *   GIỮ completedVersion, acknowledgedVersion (lịch sử phiên bản đã học).
 * - lesson_progress mọi bài của khoá → chưa xong, xoá vị trí xem video, bonusAttempts = 0.
 * - KHÔNG xoá quiz_attempts, certificates (lịch sử có cột phiên bản; số lượt làm bài tính theo phiên bản).
 */
export async function resetEnrollmentForRelearn(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  options: { dueDate: Date; reason: RelearnReason },
): Promise<{ enrollmentId: string; userId: string; courseId: string; lessonsReset: number; reason: RelearnReason }> {
  const enrollment = await tx.enrollment.update({
    where: { id: enrollmentId },
    data: {
      status: "NOT_STARTED",
      progressPercent: 0,
      startedAt: null,
      completedAt: null,
      dueDate: options.dueDate,
    },
    select: { id: true, userId: true, courseId: true },
  });
  const reset = await tx.lessonProgress.updateMany({
    where: { userId: enrollment.userId, lesson: { section: { courseId: enrollment.courseId } } },
    data: { isCompleted: false, completedAt: null, lastPositionSeconds: 0, maxWatchedSeconds: 0, bonusAttempts: 0 },
  });
  return { enrollmentId, userId: enrollment.userId, courseId: enrollment.courseId, lessonsReset: reset.count, reason: options.reason };
}

export type LessonActionResult = { ok: true; completion: LessonCompletion } | { ok: false; error: string };

/** “Đã đọc xong” bài tài liệu: kiểm tra quyền + loại bài + đã mở đủ 15 giây → completeLesson. */
export async function completeDocumentLesson(userId: string, lessonId: string): Promise<LessonActionResult> {
  const courseId = await getCourseIdOfLesson(lessonId);
  if (!courseId) return { ok: false, error: "Không tìm thấy bài học." };
  const access = await getLessonAccess(userId, courseId, lessonId);
  if (!access.ok) return { ok: false, error: "Bạn chưa được học bài này." };
  if (access.lesson.type !== "DOCUMENT") return { ok: false, error: "Chỉ bài tài liệu mới bấm “Đã đọc xong”." };

  if (!access.lesson.completed) {
    const progress = await getLessonProgress(userId, lessonId);
    const openedFor = progress ? (Date.now() - progress.updatedAt.getTime()) / 1000 : 0;
    if (openedFor < DOCUMENT_MIN_SECONDS - 2) {
      return { ok: false, error: `Hãy đọc bài ít nhất ${DOCUMENT_MIN_SECONDS} giây rồi bấm “Đã đọc xong”.` };
    }
  }
  return { ok: true, completion: await completeLesson(userId, lessonId) };
}

/** Trình phát gửi tiến độ mỗi 10 giây → mỗi lần gửi tính tối đa 25 giây thời gian thực (×2 cho tốc độ phát 2x). */
const MAX_PROGRESS_GAP_SECONDS = 25;

export type VideoProgressResult =
  | { ok: true; maxWatchedSeconds: number; completed: boolean; completion: LessonCompletion | null }
  | { ok: false; status: 400 | 403 | 404; error: string };

/**
 * Ghi tiến độ xem video (route POST /api/learn/progress). Chống gửi số giả:
 * maxWatchedSeconds chỉ tăng tối đa min(thời gian thực trôi qua từ lần ghi trước, 25 giây) × 2 + 5 giây (cho phép tốc độ phát 2x).
 * Luôn cập nhật lastPositionSeconds. Xem đủ durationSeconds × minWatchPercent / 100 → completeLesson.
 */
export async function recordVideoProgress(
  userId: string,
  lessonId: string,
  input: { position: number; watched: number },
): Promise<VideoProgressResult> {
  const courseId = await getCourseIdOfLesson(lessonId);
  if (!courseId) return { ok: false, status: 404, error: "Không tìm thấy bài học." };
  const access = await getLessonAccess(userId, courseId, lessonId);
  if (!access.ok) return { ok: false, status: 403, error: "Bạn chưa được học bài này." };
  if (access.lesson.type !== "VIDEO") return { ok: false, status: 400, error: "Bài học không phải video." };

  const lesson = await prisma.lesson.findUniqueOrThrow({
    where: { id: lessonId },
    select: { videoStatus: true, durationSeconds: true, minWatchPercent: true },
  });
  const duration = lesson.durationSeconds ?? 0;
  if (lesson.videoStatus !== "READY" || duration <= 0) return { ok: false, status: 400, error: "Video chưa sẵn sàng." };

  const prev = await getLessonProgress(userId, lessonId);
  const prevMax = prev?.maxWatchedSeconds ?? 0;
  // Trần thời gian mỗi lần gửi: mở bài rồi bỏ đi lâu không được cộng dồn thành "đã xem" (Việc 29B #6)
  const elapsed = prev ? Math.min(MAX_PROGRESS_GAP_SECONDS, Math.max(0, (Date.now() - prev.updatedAt.getTime()) / 1000)) : 0;
  const allowed = prevMax + elapsed * 2 + 5;
  const maxWatchedSeconds = Math.max(prevMax, Math.round(Math.min(input.watched, allowed, duration)));
  const lastPositionSeconds = Math.round(Math.min(Math.max(input.position, 0), duration));

  await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId, lessonId } },
    create: { userId, lessonId, maxWatchedSeconds, lastPositionSeconds },
    update: { maxWatchedSeconds, lastPositionSeconds },
  });

  const wasCompleted = prev?.isCompleted ?? false;
  // Cho lệch 1 giây: thời lượng trình phát báo có thể ngắn hơn số đã lưu một chút
  const reached = maxWatchedSeconds + 1 >= (duration * lesson.minWatchPercent) / 100;
  const completion = !wasCompleted && reached ? await completeLesson(userId, lessonId) : null;
  return { ok: true, maxWatchedSeconds, completed: wasCompleted || !!completion, completion };
}
