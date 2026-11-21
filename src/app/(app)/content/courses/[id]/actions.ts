"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type CourseStatus } from "@prisma/client";
import { z } from "zod";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { courseCodeSchema, courseTitleSchema, optionalIdSchema } from "@/lib/course-rules";
import { canEditCourse, findCourseInScope } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { deleteFile, saveFile } from "@/lib/storage";

/**
 * Trang soạn khoá học — tab Thông tin, Lưu trữ / Khôi phục.
 * Mọi action: requireRole -> tìm khoá trong phạm vi (Quy tắc 1) -> chỉ sửa khi canEditCourse.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"] as const;
const FIELDS = ["code", "title", "description", "categoryId", "allowSelfEnroll", "hasCertificate", "certificateValidMonths"];
const THUMBNAIL_FOLDER = "courses/thumbnails";
const NO_ACCESS = "Khoá học không tồn tại hoặc bạn không có quyền sửa.";

const flag = z.string().transform((v) => v === "1" || v === "on" || v === "true");

const infoSchema = z
  .object({
    code: courseCodeSchema,
    title: courseTitleSchema,
    description: z
      .string()
      .trim()
      .max(5000, "Mô tả tối đa 5.000 ký tự.")
      .transform((v) => (v === "" ? null : v)),
    categoryId: optionalIdSchema,
    allowSelfEnroll: flag,
    hasCertificate: flag,
    certificateValidMonths: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{1,3}$/.test(v), "Thời hạn là số tháng nguyên.")
      .transform((v) => (v === "" ? null : Number(v)))
      .refine((v) => v === null || (v >= 1 && v <= 120), "Thời hạn từ 1 đến 120 tháng (để trống = vĩnh viễn)."),
  })
  // Không cấp chứng nhận -> không có thời hạn
  .transform((v) => ({ ...v, certificateValidMonths: v.hasCertificate ? v.certificateValidMonths : null }));

const idSchema = z.string().trim().min(1).max(50);

function revalidateCourse(id: string) {
  revalidatePath("/content/courses");
  revalidatePath(`/content/courses/${id}`);
}

const INFO_SELECT = {
  id: true,
  code: true,
  title: true,
  description: true,
  categoryId: true,
  thumbnailUrl: true,
  allowSelfEnroll: true,
  hasCertificate: true,
  certificateValidMonths: true,
  ownerCompanyId: true,
  status: true,
  currentVersion: true,
} satisfies Prisma.CourseSelect;

export async function updateCourseInfoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);

  const id = idSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) return { message: "Không xác định được khoá học." };
  const course = await findCourseInScope(actor, id.data, INFO_SELECT);
  if (!course || !canEditCourse(actor, course)) return { message: NO_ACCESS };

  const fail = (errors: Record<string, string>, message?: string): ActionState => ({
    errors,
    message,
    values: formValues(formData, FIELDS),
  });

  const parsed = infoSchema.safeParse({
    code: formData.get("code") ?? "",
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    categoryId: formData.get("categoryId") ?? "",
    allowSelfEnroll: formData.get("allowSelfEnroll") ?? "",
    hasCertificate: formData.get("hasCertificate") ?? "",
    certificateValidMonths: formData.get("certificateValidMonths") ?? "",
  });
  if (!parsed.success) return fail(fieldErrors(parsed.error));
  const input = parsed.data;

  // Danh mục: chỉ chọn được danh mục đang dùng; danh mục hiện tại (kể cả đã ẩn) được giữ nguyên
  if (input.categoryId && input.categoryId !== course.categoryId) {
    const category = await prisma.courseCategory.findUnique({
      where: { id: input.categoryId },
      select: { isActive: true },
    });
    if (!category || !category.isActive) return fail({ categoryId: "Danh mục không tồn tại hoặc đã bị ẩn." });
  }

  if (input.code !== course.code) {
    const dup = await prisma.course.findUnique({ where: { code: input.code }, select: { id: true } });
    if (dup && dup.id !== course.id) return fail({ code: `Mã khoá học “${input.code}” đã tồn tại.` });
  }

  // Ảnh bìa: file mới (kiểm tra theo nội dung) / xoá ảnh / giữ nguyên
  const file = formData.get("thumbnail");
  const removeThumbnail = formData.get("removeThumbnail") === "1";
  let newThumbnail: string | null = null;
  if (file instanceof File && file.size > 0) {
    const saved = await saveFile(file, THUMBNAIL_FOLDER, "image");
    if ("error" in saved) return fail({ thumbnail: saved.error });
    newThumbnail = saved.key;
  }
  const thumbnailUrl = newThumbnail ?? (removeThumbnail ? null : course.thumbnailUrl);
  const thumbnailChange = newThumbnail
    ? course.thumbnailUrl
      ? "replaced"
      : "added"
    : removeThumbnail && course.thumbnailUrl
      ? "removed"
      : null;

  // --- Chỉ ghi phần thay đổi ---
  const before = {
    code: course.code,
    title: course.title,
    description: course.description,
    categoryId: course.categoryId,
    allowSelfEnroll: course.allowSelfEnroll,
    hasCertificate: course.hasCertificate,
    certificateValidMonths: course.certificateValidMonths,
  };
  const after = {
    code: input.code,
    title: input.title,
    description: input.description,
    categoryId: input.categoryId,
    allowSelfEnroll: input.allowSelfEnroll,
    hasCertificate: input.hasCertificate,
    certificateValidMonths: input.certificateValidMonths,
  };
  const changed = (Object.keys(before) as (keyof typeof before)[]).filter((k) => before[k] !== after[k]);
  if (changed.length === 0 && !thumbnailChange) return { ok: true, message: "Không có thay đổi nào." };

  // Mô tả có thể dài -> nhật ký chỉ giữ 200 ký tự đầu
  const clip = (k: keyof typeof before, v: unknown) =>
    k === "description" && typeof v === "string" && v.length > 200 ? `${v.slice(0, 200)}…` : v;

  try {
    await prisma.$transaction([
      prisma.course.update({ where: { id: course.id }, data: { ...after, thumbnailUrl } }),
      logAudit(prisma, {
        actorId: actor.id,
        companyId: course.ownerCompanyId,
        action: "COURSE_UPDATED",
        entityType: "Course",
        entityId: course.id,
        metadata: {
          code: input.code,
          before: Object.fromEntries([
            ...changed.map((k) => [k, clip(k, before[k])]),
            ...(thumbnailChange ? [["thumbnail", course.thumbnailUrl ? "has" : "none"]] : []),
          ]) as Prisma.InputJsonObject,
          after: Object.fromEntries([
            ...changed.map((k) => [k, clip(k, after[k])]),
            ...(thumbnailChange ? [["thumbnail", thumbnailChange]] : []),
          ]) as Prisma.InputJsonObject,
        },
      }),
    ]);
  } catch (error) {
    // Không lưu được -> bỏ ảnh vừa tải lên
    await deleteFile(newThumbnail);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return fail({ code: `Mã khoá học “${input.code}” đã tồn tại.` });
    }
    throw error;
  }

  // Lưu xong mới xoá ảnh cũ
  if (thumbnailChange === "replaced" || thumbnailChange === "removed") await deleteFile(course.thumbnailUrl);

  revalidateCourse(course.id);
  return { ok: true, message: "Đã lưu thông tin khoá học." };
}

async function setStatus(courseId: string, kind: "archive" | "restore"): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const id = idSchema.safeParse(courseId);
  if (!id.success) return { message: "Không xác định được khoá học." };
  const course = await findCourseInScope(actor, id.data, INFO_SELECT);
  if (!course || !canEditCourse(actor, course)) return { message: NO_ACCESS };

  if (kind === "archive" && course.status === "ARCHIVED") return { message: "Khoá học đã ở trạng thái Lưu trữ." };
  if (kind === "restore" && course.status !== "ARCHIVED") return { message: "Khoá học không ở trạng thái Lưu trữ." };

  // Khôi phục: đã từng phát hành -> Đã phát hành; chưa -> Nháp
  const to: CourseStatus = kind === "archive" ? "ARCHIVED" : course.currentVersion > 0 ? "PUBLISHED" : "DRAFT";

  await prisma.$transaction([
    prisma.course.update({ where: { id: course.id }, data: { status: to } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: kind === "archive" ? "COURSE_ARCHIVED" : "COURSE_RESTORED",
      entityType: "Course",
      entityId: course.id,
      metadata: { code: course.code, from: course.status, to },
    }),
  ]);

  revalidateCourse(course.id);
  return {
    ok: true,
    message:
      kind === "archive"
        ? `Đã lưu trữ khoá học ${course.code}. Khoá sẽ ẩn khỏi thư viện.`
        : `Đã khôi phục khoá học ${course.code} về trạng thái ${to === "PUBLISHED" ? "Đã phát hành" : "Nháp"}.`,
  };
}

export async function archiveCourseAction(courseId: string): Promise<ActionState> {
  return setStatus(courseId, "archive");
}

export async function restoreCourseAction(courseId: string): Promise<ActionState> {
  return setStatus(courseId, "restore");
}
