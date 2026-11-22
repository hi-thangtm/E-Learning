"use server";

import { revalidatePath } from "next/cache";
import type { LessonType, Prisma } from "@prisma/client";
import { z } from "zod";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { findCourseForEdit, findLessonForEdit, findSectionForEdit, isPublished } from "@/lib/course-content";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isBlankHtml, sanitizeLessonHtml } from "@/lib/sanitize";
import { getSetting } from "@/lib/settings";
import { deleteBunnyVideo } from "@/lib/bunny";
import { deleteFile } from "@/lib/storage";
import type { ContentLayout } from "./content-types";

/**
 * Tab Nội dung: chương, bài học, sắp xếp (docs/database.md — Quy tắc 2, 4).
 * - Mọi action: requireRole -> tìm chương / bài / khoá TRONG phạm vi + có quyền sửa (canEditCourse).
 * - Khoá chưa phát hành (currentVersion = 0): xoá hẳn. Đã phát hành: chỉ ẩn (isArchived), giữ lịch sử học.
 * - Nhật ký chỉ ghi tên chương / bài + loại, KHÔNG ghi nội dung HTML.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"] as const;
const NO_ACCESS = "Không tìm thấy nội dung hoặc bạn không có quyền sửa khoá học này.";
const LESSON_TYPES = ["VIDEO", "DOCUMENT", "QUIZ"] as const;

const titleSchema = (what: string) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(2, `Tên ${what} tối thiểu 2 ký tự.`).max(200, `Tên ${what} tối đa 200 ký tự.`));

const sectionTitle = titleSchema("chương");
const lessonTitle = titleSchema("bài");

function revalidateCourse(courseId: string) {
  revalidatePath(`/content/courses/${courseId}`);
}

const courseMeta = (course: { id: string; code: string }) => ({ courseId: course.id, courseCode: course.code });

// ---------------------------------------------------------------------------------------------
// Chương

export async function createSectionAction(courseId: string, title: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const course = await findCourseForEdit(actor, courseId);
  if (!course) return { message: NO_ACCESS };

  const parsed = sectionTitle.safeParse(title);
  if (!parsed.success) return { errors: { title: parsed.error.issues[0].message } };

  await prisma.$transaction(async (tx) => {
    const last = await tx.courseSection.aggregate({ where: { courseId: course.id }, _max: { sortOrder: true } });
    const section = await tx.courseSection.create({
      data: { courseId: course.id, title: parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
    await logAudit(tx, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "SECTION_CREATED",
      entityType: "CourseSection",
      entityId: section.id,
      metadata: { ...courseMeta(course), sectionTitle: parsed.data },
    });
  });

  revalidateCourse(course.id);
  return { ok: true, message: `Đã thêm chương “${parsed.data}”.` };
}

export async function renameSectionAction(sectionId: string, title: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const section = await findSectionForEdit(actor, sectionId);
  if (!section) return { message: NO_ACCESS };

  const parsed = sectionTitle.safeParse(title);
  if (!parsed.success) return { errors: { title: parsed.error.issues[0].message } };
  if (parsed.data === section.title) return { ok: true, message: "Không có thay đổi nào." };

  await prisma.$transaction([
    prisma.courseSection.update({ where: { id: section.id }, data: { title: parsed.data } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: section.course.ownerCompanyId,
      action: "SECTION_UPDATED",
      entityType: "CourseSection",
      entityId: section.id,
      metadata: {
        ...courseMeta(section.course),
        sectionTitle: parsed.data,
        before: { name: section.title },
        after: { name: parsed.data },
      },
    }),
  ]);

  revalidateCourse(section.course.id);
  return { ok: true, message: "Đã đổi tên chương." };
}

/** Chưa phát hành -> xoá hẳn chương + mọi bài trong chương. Đã phát hành -> ẩn chương. */
export async function removeSectionAction(sectionId: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const section = await findSectionForEdit(actor, sectionId);
  if (!section) return { message: NO_ACCESS };
  const course = section.course;
  const base = {
    actorId: actor.id,
    companyId: course.ownerCompanyId,
    entityType: "CourseSection" as const,
    entityId: section.id,
  };

  if (isPublished(course)) {
    if (section.isArchived) return { message: "Chương đã ẩn từ trước." };
    await prisma.$transaction([
      prisma.courseSection.update({ where: { id: section.id }, data: { isArchived: true } }),
      logAudit(prisma, {
        ...base,
        action: "SECTION_ARCHIVED",
        metadata: { ...courseMeta(course), sectionTitle: section.title, lessonCount: section._count.lessons },
      }),
    ]);
    revalidateCourse(course.id);
    return { ok: true, message: `Đã ẩn chương “${section.title}” khỏi học viên.` };
  }

  // File PDF + video Bunny của các bài trong chương -> xoá sau khi xoá dữ liệu
  const files = await prisma.lesson.findMany({
    where: { sectionId: section.id, OR: [{ fileUrl: { not: null } }, { videoProvider: "BUNNY" }] },
    select: { fileUrl: true, videoProvider: true, videoId: true },
  });
  await prisma.$transaction([
    // Bài trong chương bị xoá theo (onDelete: Cascade)
    prisma.courseSection.delete({ where: { id: section.id } }),
    logAudit(prisma, {
      ...base,
      action: "SECTION_DELETED",
      metadata: { ...courseMeta(course), sectionTitle: section.title, lessonCount: section._count.lessons },
    }),
  ]);
  for (const f of files) {
    await deleteFile(f.fileUrl);
    if (f.videoProvider === "BUNNY") await deleteBunnyVideo(f.videoId);
  }

  revalidateCourse(course.id);
  return {
    ok: true,
    message:
      section._count.lessons > 0
        ? `Đã xoá chương “${section.title}” và ${section._count.lessons} bài trong chương.`
        : `Đã xoá chương “${section.title}”.`,
  };
}

export async function restoreSectionAction(sectionId: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const section = await findSectionForEdit(actor, sectionId);
  if (!section) return { message: NO_ACCESS };
  if (!section.isArchived) return { message: "Chương đang hiện." };

  await prisma.$transaction([
    prisma.courseSection.update({ where: { id: section.id }, data: { isArchived: false } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: section.course.ownerCompanyId,
      action: "SECTION_RESTORED",
      entityType: "CourseSection",
      entityId: section.id,
      metadata: { ...courseMeta(section.course), sectionTitle: section.title },
    }),
  ]);

  revalidateCourse(section.course.id);
  return { ok: true, message: `Đã hiện lại chương “${section.title}”.` };
}

// ---------------------------------------------------------------------------------------------
// Bài học

export async function createLessonAction(
  sectionId: string,
  type: LessonType,
  title: string,
): Promise<ActionState & { lessonId?: string }> {
  const actor = await requireRole([...ROLES]);
  const section = await findSectionForEdit(actor, sectionId);
  if (!section) return { message: NO_ACCESS };
  if (!(LESSON_TYPES as readonly string[]).includes(type)) return { message: "Loại bài không hợp lệ." };

  const parsed = lessonTitle.safeParse(title);
  if (!parsed.success) return { errors: { title: parsed.error.issues[0].message } };

  // Mặc định theo loại (sửa tiếp ở dialog chi tiết)
  const defaults: Prisma.LessonUncheckedCreateInput =
    type === "VIDEO"
      ? { sectionId, title: "", type, minWatchPercent: await getSetting("DEFAULT_MIN_WATCH_PERCENT") }
      : type === "QUIZ"
        ? { sectionId, title: "", type, questionCount: 10, passingScore: 70, timeLimitMinutes: 15, maxAttempts: null, showAnswers: false }
        : { sectionId, title: "", type };

  const lessonId = await prisma.$transaction(async (tx) => {
    const last = await tx.lesson.aggregate({ where: { sectionId: section.id }, _max: { sortOrder: true } });
    const lesson = await tx.lesson.create({
      data: { ...defaults, title: parsed.data, sortOrder: (last._max.sortOrder ?? -1) + 1 },
      select: { id: true },
    });
    await logAudit(tx, {
      actorId: actor.id,
      companyId: section.course.ownerCompanyId,
      action: "LESSON_CREATED",
      entityType: "Lesson",
      entityId: lesson.id,
      metadata: { ...courseMeta(section.course), sectionTitle: section.title, lessonTitle: parsed.data, lessonType: type },
    });
    return lesson.id;
  });

  revalidateCourse(section.course.id);
  return { ok: true, lessonId, message: `Đã thêm bài “${parsed.data}”.` };
}

/** Chưa phát hành -> xoá hẳn (kèm file PDF). Đã phát hành -> ẩn bài. */
export async function removeLessonAction(lessonId: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const lesson = await findLessonForEdit(actor, lessonId);
  if (!lesson) return { message: NO_ACCESS };
  const course = lesson.section.course;
  const base = { actorId: actor.id, companyId: course.ownerCompanyId, entityType: "Lesson" as const, entityId: lesson.id };
  const meta = { ...courseMeta(course), sectionTitle: lesson.section.title, lessonTitle: lesson.title, lessonType: lesson.type };

  if (isPublished(course)) {
    if (lesson.isArchived) return { message: "Bài đã ẩn từ trước." };
    await prisma.$transaction([
      prisma.lesson.update({ where: { id: lesson.id }, data: { isArchived: true } }),
      logAudit(prisma, { ...base, action: "LESSON_ARCHIVED", metadata: meta }),
    ]);
    revalidateCourse(course.id);
    return { ok: true, message: `Đã ẩn bài “${lesson.title}” khỏi học viên.` };
  }

  await prisma.$transaction([
    prisma.lesson.delete({ where: { id: lesson.id } }),
    logAudit(prisma, { ...base, action: "LESSON_DELETED", metadata: meta }),
  ]);
  await deleteFile(lesson.fileUrl);
  if (lesson.videoProvider === "BUNNY") await deleteBunnyVideo(lesson.videoId);

  revalidateCourse(course.id);
  return { ok: true, message: `Đã xoá bài “${lesson.title}”.` };
}

export async function restoreLessonAction(lessonId: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const lesson = await findLessonForEdit(actor, lessonId);
  if (!lesson) return { message: NO_ACCESS };
  if (!lesson.isArchived) return { message: "Bài đang hiện." };
  const course = lesson.section.course;

  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data: { isArchived: false } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "LESSON_RESTORED",
      entityType: "Lesson",
      entityId: lesson.id,
      metadata: { ...courseMeta(course), sectionTitle: lesson.section.title, lessonTitle: lesson.title, lessonType: lesson.type },
    }),
  ]);

  revalidateCourse(course.id);
  return { ok: true, message: `Đã hiện lại bài “${lesson.title}”.` };
}

// --- Sửa chi tiết bài (dialog) ---------------------------------------------------------------

const intField = (min: number, max: number, message: string, optional: boolean) =>
  z
    .string()
    .trim()
    .refine((v) => (optional && v === "") || /^\d{1,4}$/.test(v), message)
    .transform((v) => (v === "" ? null : Number(v)))
    .refine((v) => v === null || (v >= min && v <= max), message);

const videoSchema = z.object({
  minWatchPercent: intField(1, 100, "% xem tối thiểu từ 1 đến 100.", false),
});

const documentSchema = z.object({
  // Giới hạn thô trước khi lọc (tránh gửi nội dung quá lớn)
  content: z.string().max(200_000, "Nội dung quá dài (tối đa khoảng 200.000 ký tự)."),
});

const quizSchema = z.object({
  questionTopic: z
    .string()
    .trim()
    .max(100, "Chủ đề tối đa 100 ký tự.")
    .transform((v) => (v === "" ? null : v)),
  questionCount: intField(1, 200, "Số câu từ 1 đến 200.", false),
  passingScore: intField(0, 100, "Điểm đạt từ 0 đến 100.", false),
  timeLimitMinutes: intField(1, 600, "Thời gian từ 1 đến 600 phút (để trống = không giới hạn).", true),
  maxAttempts: intField(1, 100, "Số lần làm từ 1 đến 100 (để trống = không giới hạn).", true),
  showAnswers: z.string().transform((v) => v === "1"),
});

const LESSON_FIELDS = [
  "title",
  "content",
  "minWatchPercent",
  "questionTopic",
  "questionCount",
  "passingScore",
  "timeLimitMinutes",
  "maxAttempts",
  "showAnswers",
];

export async function updateLessonAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const lesson = await findLessonForEdit(actor, String(formData.get("id") ?? ""));
  if (!lesson) return { message: NO_ACCESS };
  const course = lesson.section.course;

  const fail = (errors: Record<string, string>): ActionState => ({ errors, values: formValues(formData, LESSON_FIELDS) });
  const get = (k: string) => String(formData.get(k) ?? "");

  const title = lessonTitle.safeParse(get("title"));
  if (!title.success) return fail({ title: title.error.issues[0].message });

  // Loại bài lấy từ database, không tin trình duyệt
  let data: Prisma.LessonUpdateInput = { title: title.data };
  let contentChanged = false;
  if (lesson.type === "VIDEO") {
    const parsed = videoSchema.safeParse({ minWatchPercent: get("minWatchPercent") });
    if (!parsed.success) return fail(fieldErrors(parsed.error));
    data = { ...data, minWatchPercent: parsed.data.minWatchPercent! };
  } else if (lesson.type === "DOCUMENT") {
    const parsed = documentSchema.safeParse({ content: get("content") });
    if (!parsed.success) return fail(fieldErrors(parsed.error));
    const clean = sanitizeLessonHtml(parsed.data.content);
    const content = isBlankHtml(clean) ? null : clean;
    if (!content && !lesson.fileUrl) {
      return fail({ content: "Bài tài liệu phải có nội dung HOẶC file PDF đính kèm." });
    }
    contentChanged = content !== lesson.content;
    data = { ...data, content };
  } else {
    const parsed = quizSchema.safeParse({
      questionTopic: get("questionTopic"),
      questionCount: get("questionCount"),
      passingScore: get("passingScore"),
      timeLimitMinutes: get("timeLimitMinutes"),
      maxAttempts: get("maxAttempts"),
      showAnswers: get("showAnswers"),
    });
    if (!parsed.success) return fail(fieldErrors(parsed.error));
    data = { ...data, ...parsed.data };
  }

  // Trường thay đổi (chỉ ghi tên trường; nội dung HTML không đưa vào nhật ký)
  const current = lesson as unknown as Record<string, unknown>;
  const changedFields = Object.entries(data)
    .filter(([key, value]) => (key === "content" ? contentChanged : current[key] !== value))
    .map(([key]) => key);
  if (changedFields.length === 0) return { ok: true, message: "Không có thay đổi nào." };

  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "LESSON_UPDATED",
      entityType: "Lesson",
      entityId: lesson.id,
      metadata: {
        ...courseMeta(course),
        sectionTitle: lesson.section.title,
        lessonTitle: title.data,
        lessonType: lesson.type,
        changedFields: changedFields.map((f) => (f === "content" ? "content" : f)),
        ...(changedFields.includes("title") && { before: { name: lesson.title }, after: { name: title.data } }),
      },
    }),
  ]);

  revalidateCourse(course.id);
  return { ok: true, message: "Đã lưu bài học." };
}

/** Gỡ file PDF khỏi bài Tài liệu (chặn nếu bài sẽ không còn nội dung). */
export async function removeLessonFileAction(lessonId: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const lesson = await findLessonForEdit(actor, lessonId);
  if (!lesson || lesson.type !== "DOCUMENT") return { message: NO_ACCESS };
  if (!lesson.fileUrl) return { message: "Bài chưa có file PDF." };
  if (isBlankHtml(lesson.content)) {
    return { message: "Không gỡ được: bài sẽ không còn nội dung. Hãy soạn nội dung và lưu trước, hoặc tải file khác thay thế." };
  }
  const course = lesson.section.course;

  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data: { fileUrl: null, fileName: null } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "LESSON_UPDATED",
      entityType: "Lesson",
      entityId: lesson.id,
      metadata: {
        ...courseMeta(course),
        sectionTitle: lesson.section.title,
        lessonTitle: lesson.title,
        lessonType: lesson.type,
        changedFields: ["file"],
        before: { file: lesson.fileName ?? "PDF" },
        after: { file: null },
      },
    }),
  ]);
  await deleteFile(lesson.fileUrl);

  revalidateCourse(course.id);
  return { ok: true, message: "Đã gỡ file PDF." };
}

// --- Sắp xếp (kéo thả) -----------------------------------------------------------------------

/**
 * Lưu thứ tự chương + bài (kể cả bài chuyển sang chương khác) trong 1 transaction.
 * Layout phải chứa ĐÚNG ĐỦ mọi chương / bài của khoá (kể cả đã ẩn), mỗi id đúng 1 lần.
 */
export async function reorderContentAction(courseId: string, layout: ContentLayout): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const course = await findCourseForEdit(actor, courseId);
  if (!course) return { message: NO_ACCESS };

  const shape = z
    .array(z.object({ sectionId: z.string().min(1).max(50), lessonIds: z.array(z.string().min(1).max(50)).max(500) }))
    .max(200)
    .safeParse(layout);
  if (!shape.success) return { message: "Dữ liệu sắp xếp không hợp lệ." };

  const sections = await prisma.courseSection.findMany({
    where: { courseId: course.id },
    select: { id: true, title: true, sortOrder: true, lessons: { select: { id: true, sortOrder: true, sectionId: true } } },
  });
  const lessons = sections.flatMap((s) => s.lessons);

  const sentSections = shape.data.map((s) => s.sectionId);
  const sentLessons = shape.data.flatMap((s) => s.lessonIds);
  const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((id) => b.includes(id));
  if (!sameSet(sentSections, sections.map((s) => s.id)) || !sameSet(sentLessons, lessons.map((l) => l.id))) {
    return { message: "Nội dung khoá học vừa được người khác thay đổi. Hãy tải lại trang rồi sắp xếp lại." };
  }

  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const lessonById = new Map(lessons.map((l) => [l.id, l]));
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  let movedLessons = 0;
  let crossSectionMoves = 0;

  shape.data.forEach((entry, sIndex) => {
    if (sectionById.get(entry.sectionId)!.sortOrder !== sIndex) {
      ops.push(prisma.courseSection.update({ where: { id: entry.sectionId }, data: { sortOrder: sIndex } }));
    }
    entry.lessonIds.forEach((lessonId, lIndex) => {
      const current = lessonById.get(lessonId)!;
      const crossed = current.sectionId !== entry.sectionId;
      if (crossed || current.sortOrder !== lIndex) {
        ops.push(prisma.lesson.update({ where: { id: lessonId }, data: { sectionId: entry.sectionId, sortOrder: lIndex } }));
        movedLessons++;
        if (crossed) crossSectionMoves++;
      }
    });
  });
  if (ops.length === 0) return { ok: true };

  await prisma.$transaction([
    ...ops,
    logAudit(prisma, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "COURSE_CONTENT_REORDERED",
      entityType: "Course",
      entityId: course.id,
      metadata: { ...courseMeta(course), sections: sections.length, movedLessons, crossSectionMoves },
    }),
  ]);

  revalidateCourse(course.id);
  return { ok: true };
}
