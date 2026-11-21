"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { courseCodeSchema, courseTitleSchema, optionalIdSchema } from "@/lib/course-rules";

/**
 * Tạo khoá học — Biên soạn, Admin công ty, Admin tập đoàn.
 * Khoá mới ở trạng thái DRAFT, thuộc công ty của người tạo (ownerCompanyId), sau đó chuyển sang trang soạn.
 */

const FIELDS = ["code", "title", "categoryId"];

const createSchema = z.object({
  code: courseCodeSchema,
  title: courseTitleSchema,
  categoryId: optionalIdSchema,
});

const duplicate = (code: string, formData: FormData): ActionState => ({
  errors: { code: `Mã khoá học “${code}” đã tồn tại.` },
  values: formValues(formData, FIELDS),
});

export async function createCourseAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);

  const parsed = createSchema.safeParse({
    code: formData.get("code") ?? "",
    title: formData.get("title") ?? "",
    categoryId: formData.get("categoryId") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, FIELDS) };
  const { code, title, categoryId } = parsed.data;

  // Khoá mới chỉ chọn được danh mục đang dùng
  if (categoryId) {
    const category = await prisma.courseCategory.findUnique({ where: { id: categoryId }, select: { isActive: true } });
    if (!category || !category.isActive) {
      return { errors: { categoryId: "Danh mục không tồn tại hoặc đã bị ẩn." }, values: formValues(formData, FIELDS) };
    }
  }

  if (await prisma.course.findUnique({ where: { code }, select: { id: true } })) return duplicate(code, formData);

  let courseId: string;
  try {
    courseId = await prisma.$transaction(async (tx) => {
      const course = await tx.course.create({
        data: { code, title, categoryId, ownerCompanyId: actor.companyId, status: "DRAFT" },
        select: { id: true },
      });
      await logAudit(tx, {
        actorId: actor.id,
        companyId: actor.companyId,
        action: "COURSE_CREATED",
        entityType: "Course",
        entityId: course.id,
        metadata: { code, title, categoryId, companyCode: actor.company.code },
      });
      return course.id;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return duplicate(code, formData);
    throw error;
  }

  revalidatePath("/content/courses");
  redirect(`/content/courses/${courseId}`);
}
