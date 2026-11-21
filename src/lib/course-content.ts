import type { Prisma } from "@prisma/client";
import { canEditCourse, courseVisibleWhere } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Tìm chương / bài để SỬA: kèm khoá học, kiểm tra phạm vi (Quy tắc 1) + quyền sửa (canEditCourse).
 * Dùng ở mọi server action và route tải PDF của tab Nội dung — không tin id gửi từ trình duyệt.
 */

const COURSE_SELECT = {
  id: true,
  code: true,
  ownerCompanyId: true,
  currentVersion: true,
} satisfies Prisma.CourseSelect;

export type EditableCourse = Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>;

const validId = (id: string) => typeof id === "string" && id.length > 0 && id.length <= 50;

export async function findCourseForEdit(actor: CurrentUser, courseId: string): Promise<EditableCourse | null> {
  if (!validId(courseId)) return null;
  const course = await prisma.course.findFirst({
    where: { AND: [{ id: courseId }, await courseVisibleWhere(actor)] },
    select: COURSE_SELECT,
  });
  return course && canEditCourse(actor, course) ? course : null;
}

export async function findSectionForEdit(actor: CurrentUser, sectionId: string) {
  if (!validId(sectionId)) return null;
  const section = await prisma.courseSection.findFirst({
    where: { id: sectionId, course: await courseVisibleWhere(actor) },
    select: {
      id: true,
      title: true,
      isArchived: true,
      course: { select: COURSE_SELECT },
      _count: { select: { lessons: true } },
    },
  });
  return section && canEditCourse(actor, section.course) ? section : null;
}

export async function findLessonForEdit(actor: CurrentUser, lessonId: string) {
  if (!validId(lessonId)) return null;
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, section: { course: await courseVisibleWhere(actor) } },
    select: {
      id: true,
      title: true,
      type: true,
      isArchived: true,
      content: true,
      fileUrl: true,
      fileName: true,
      minWatchPercent: true,
      videoProvider: true,
      videoId: true,
      questionTopic: true,
      questionCount: true,
      passingScore: true,
      timeLimitMinutes: true,
      maxAttempts: true,
      showAnswers: true,
      section: { select: { id: true, title: true, course: { select: COURSE_SELECT } } },
    },
  });
  return lesson && canEditCourse(actor, lesson.section.course) ? lesson : null;
}

/** Khoá đã phát hành (currentVersion > 0) chỉ được ẩn nội dung; chưa phát hành thì xoá hẳn. */
export function isPublished(course: { currentVersion: number }): boolean {
  return course.currentVersion > 0;
}

export const LESSON_TYPE_LABELS = { VIDEO: "Video", DOCUMENT: "Tài liệu", QUIZ: "Kiểm tra" } as const;
