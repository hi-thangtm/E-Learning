import "server-only";
import type { Prisma } from "@prisma/client";
import { getGroupCompanyId } from "@/lib/course-scope";
import { prisma } from "@/lib/db";

/**
 * Thư viện tự đăng ký (Việc 24 — feature-spec 2.7, docs/database.md Quy tắc 3). Chỉ chạy ở server.
 * Khoá hiển thị: PUBLISHED + cho phép tự đăng ký + dành cho nhân viên + của công ty tổng HOẶC công ty người xem.
 */

export async function libraryCourseWhere(user: { companyId: string }): Promise<Prisma.CourseWhereInput> {
  const groupId = await getGroupCompanyId();
  return {
    status: "PUBLISHED",
    allowSelfEnroll: true,
    audience: "EMPLOYEE",
    ownerCompanyId: { in: [...new Set([user.companyId, ...(groupId ? [groupId] : [])])] },
  };
}

/** Khoá trong thư viện của người xem (null = không tồn tại / không đủ điều kiện). */
export async function findLibraryCourse<S extends Prisma.CourseSelect>(user: { companyId: string }, courseId: string, select: S) {
  if (!courseId || courseId.length > 50) return null;
  return prisma.course.findFirst({ where: { AND: [{ id: courseId }, await libraryCourseWhere(user)] }, select });
}

export type CourseStats = { lessonCount: number; videoSeconds: number; completedCount: number };

/** Số bài + tổng thời lượng video (bài / chương đang dùng) + số người đã hoàn thành — theo lô. */
export async function getCourseStats(courseIds: string[]): Promise<Map<string, CourseStats>> {
  const result = new Map<string, CourseStats>(courseIds.map((id) => [id, { lessonCount: 0, videoSeconds: 0, completedCount: 0 }]));
  if (courseIds.length === 0) return result;
  const [lessons, completed] = await Promise.all([
    prisma.lesson.findMany({
      where: { isArchived: false, section: { courseId: { in: courseIds }, isArchived: false } },
      select: { type: true, durationSeconds: true, section: { select: { courseId: true } } },
    }),
    prisma.enrollment.groupBy({ by: ["courseId"], where: { courseId: { in: courseIds }, status: "COMPLETED" }, _count: { _all: true } }),
  ]);
  for (const l of lessons) {
    const s = result.get(l.section.courseId)!;
    s.lessonCount++;
    if (l.type === "VIDEO") s.videoSeconds += l.durationSeconds ?? 0;
  }
  for (const c of completed) result.get(c.courseId)!.completedCount = c._count._all;
  return result;
}

export type LibraryStatus = "completed" | "path" | "enrolled";

/** Tình trạng của tôi với từng khoá (lượt học khác CANCELLED). */
export async function getMyLibraryStatus(userId: string, courseIds: string[]): Promise<Map<string, LibraryStatus>> {
  if (courseIds.length === 0) return new Map();
  const rows = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: courseIds }, status: { not: "CANCELLED" } },
    select: { courseId: true, status: true, learningPathId: true },
  });
  return new Map(
    rows.map((r) => [r.courseId, r.status === "COMPLETED" ? "completed" : r.learningPathId ? "path" : "enrolled"] as const),
  );
}

export const LIBRARY_STATUS_LABELS: Record<LibraryStatus, { label: string; tone: "success" | "info" | "primary" }> = {
  completed: { label: "Đã hoàn thành", tone: "success" },
  path: { label: "Thuộc lộ trình", tone: "info" },
  enrolled: { label: "Đã đăng ký", tone: "primary" },
};

/**
 * Lượt tự đăng ký còn huỷ được: source SELF, NOT_STARTED, chưa có tiến độ bài / lần làm bài kiểm tra nào của khoá.
 * Trả id lượt học (null = không huỷ được).
 */
export async function cancellableSelfEnrollment(userId: string, courseId: string): Promise<string | null> {
  if (!courseId || courseId.length > 50) return null;
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, courseId, source: "SELF", status: "NOT_STARTED" },
    select: { id: true },
  });
  if (!enrollment) return null;
  const lessonOfCourse = { section: { courseId } };
  const [progress, attempts] = await Promise.all([
    prisma.lessonProgress.count({ where: { userId, lesson: lessonOfCourse } }),
    prisma.quizAttempt.count({ where: { userId, lesson: lessonOfCourse } }),
  ]);
  return progress + attempts === 0 ? enrollment.id : null;
}
