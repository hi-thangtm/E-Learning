import { z } from "zod";
import { canEditCourse, courseVisibleWhere } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Phạm vi sửa ngân hàng câu hỏi (dùng ở actions, import, route xuất file) — chỉ chạy ở server.
 * Khoá phải nằm trong phạm vi xem (courseVisibleWhere) VÀ được sửa (canEditCourse).
 */

const idSchema = z.string().trim().min(1).max(50);

export const EDIT_COURSE_SELECT = { id: true, code: true, title: true, ownerCompanyId: true, currentVersion: true } as const;
export type EditableCourse = { id: string; code: string; title: string; ownerCompanyId: string; currentVersion: number };

/** Khoá học trong phạm vi XEM (null nếu không có / ngoài phạm vi). */
export async function findCourseForView(actor: CurrentUser, courseId: unknown): Promise<EditableCourse | null> {
  const id = idSchema.safeParse(courseId);
  if (!id.success) return null;
  return prisma.course.findFirst({
    where: { AND: [{ id: id.data }, await courseVisibleWhere(actor)] },
    select: EDIT_COURSE_SELECT,
  });
}

/** Khoá học được SỬA (không tin id gửi từ trình duyệt). */
export async function findCourseForEdit(actor: CurrentUser, courseId: unknown): Promise<EditableCourse | null> {
  const course = await findCourseForView(actor, courseId);
  return course && canEditCourse(actor, course) ? course : null;
}

/** Câu hỏi thuộc khoá được sửa. */
export async function findQuestionForEdit(actor: CurrentUser, questionId: unknown) {
  const id = idSchema.safeParse(questionId);
  if (!id.success) return null;
  const question = await prisma.question.findFirst({
    where: { id: id.data, course: await courseVisibleWhere(actor) },
    select: {
      id: true,
      topic: true,
      type: true,
      content: true,
      imageUrl: true,
      options: true,
      explanation: true,
      isActive: true,
      course: { select: EDIT_COURSE_SELECT },
    },
  });
  return question && canEditCourse(actor, question.course) ? question : null;
}
