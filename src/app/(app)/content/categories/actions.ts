"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";

/**
 * Danh mục khoá học — dùng chung toàn tập đoàn, CHỈ Admin tập đoàn được thêm / sửa / ẩn hiện / đổi thứ tự.
 * Mọi action kiểm tra quyền ở server bằng requireRole (không chỉ ẩn nút).
 * Danh mục đã ẩn: không chọn được cho khoá học mới; khoá học cũ vẫn giữ danh mục (không xoá, không gỡ).
 */

const PATH = "/content/categories";
const MAX_SORT = 9999;

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(2, "Tên danh mục tối thiểu 2 ký tự.").max(100, "Tên danh mục tối đa 100 ký tự.")),
  // Để trống = tự xếp cuối danh sách
  sortOrder: z
    .string()
    .trim()
    .refine((v) => v === "" || /^\d{1,4}$/.test(v), `Thứ tự là số nguyên từ 0 đến ${MAX_SORT}.`)
    .transform((v) => (v === "" ? null : Number(v))),
});

const idSchema = z.string().trim().min(1, "Thiếu mã bản ghi.").max(50);

const FIELDS = ["name", "sortOrder"];

function duplicateName(name: string, formData: FormData): ActionState {
  return { errors: { name: `Danh mục “${name}” đã tồn tại.` }, values: formValues(formData, FIELDS) };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

/** Trùng tên (không phân biệt hoa thường), trừ chính nó khi sửa. */
async function findDuplicate(name: string, exceptId?: string) {
  return prisma.courseCategory.findFirst({
    where: { name: { equals: name, mode: "insensitive" }, ...(exceptId && { NOT: { id: exceptId } }) },
    select: { id: true },
  });
}

function parse(formData: FormData) {
  return categorySchema.safeParse({
    name: formData.get("name") ?? "",
    sortOrder: formData.get("sortOrder") ?? "",
  });
}

export async function createCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, FIELDS) };
  const { name } = parsed.data;

  if (await findDuplicate(name)) return duplicateName(name, formData);

  try {
    await prisma.$transaction(async (tx) => {
      const last = await tx.courseCategory.aggregate({ _max: { sortOrder: true } });
      const sortOrder = parsed.data.sortOrder ?? Math.min((last._max.sortOrder ?? -1) + 1, MAX_SORT);
      const category = await tx.courseCategory.create({ data: { name, sortOrder } });
      await logAudit(tx, {
        actorId: user.id,
        companyId: user.companyId,
        action: "CATEGORY_CREATED",
        entityType: "CourseCategory",
        entityId: category.id,
        metadata: { name, sortOrder },
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateName(name, formData);
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: `Đã thêm danh mục “${name}”.` };
}

export async function updateCategoryAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) return { message: "Không xác định được danh mục cần sửa." };

  const parsed = parse(formData);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, FIELDS) };

  const current = await prisma.courseCategory.findUnique({
    where: { id: id.data },
    select: { id: true, name: true, sortOrder: true },
  });
  if (!current) return { message: "Danh mục không tồn tại hoặc đã bị thay đổi." };

  const name = parsed.data.name;
  const sortOrder = parsed.data.sortOrder ?? current.sortOrder;
  if (current.name === name && current.sortOrder === sortOrder) return { ok: true, message: "Không có thay đổi nào." };

  if (name.toLowerCase() !== current.name.toLowerCase() && (await findDuplicate(name, current.id))) {
    return duplicateName(name, formData);
  }

  try {
    await prisma.$transaction([
      prisma.courseCategory.update({ where: { id: current.id }, data: { name, sortOrder } }),
      logAudit(prisma, {
        actorId: user.id,
        companyId: user.companyId,
        action: "CATEGORY_UPDATED",
        entityType: "CourseCategory",
        entityId: current.id,
        metadata: {
          before: { name: current.name, sortOrder: current.sortOrder },
          after: { name, sortOrder },
        },
      }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateName(name, formData);
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: `Đã cập nhật danh mục “${name}”.` };
}

export async function toggleCategoryAction(categoryId: string): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(categoryId);
  if (!id.success) return { message: "Không xác định được danh mục." };

  const current = await prisma.courseCategory.findUnique({
    where: { id: id.data },
    select: { id: true, name: true, isActive: true },
  });
  if (!current) return { message: "Danh mục không tồn tại hoặc đã bị thay đổi." };

  const isActive = !current.isActive;

  await prisma.$transaction([
    prisma.courseCategory.update({ where: { id: current.id }, data: { isActive } }),
    logAudit(prisma, {
      actorId: user.id,
      companyId: user.companyId,
      action: "CATEGORY_TOGGLED",
      entityType: "CourseCategory",
      entityId: current.id,
      metadata: { name: current.name, isActive },
    }),
  ]);

  revalidatePath(PATH);
  return {
    ok: true,
    message: isActive ? `Đã hiện lại danh mục “${current.name}”.` : `Đã ẩn danh mục “${current.name}”.`,
  };
}

/**
 * Đổi thứ tự bằng nút mũi tên: đổi chỗ với danh mục liền trên / dưới theo thứ tự toàn bộ
 * (sortOrder, rồi tên). Đánh lại số 0, 1, 2… cho cả danh sách để không còn số trùng.
 */
export async function moveCategoryAction(categoryId: string, direction: "up" | "down"): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(categoryId);
  if (!id.success || (direction !== "up" && direction !== "down")) return { message: "Yêu cầu không hợp lệ." };

  const all = await prisma.courseCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, sortOrder: true },
  });
  const index = all.findIndex((c) => c.id === id.data);
  if (index < 0) return { message: "Danh mục không tồn tại hoặc đã bị thay đổi." };
  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= all.length) {
    return { message: direction === "up" ? "Danh mục đã ở đầu danh sách." : "Danh mục đã ở cuối danh sách." };
  }

  const reordered = [...all];
  [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
  const changes = reordered
    .map((c, i) => ({ ...c, newOrder: i }))
    .filter((c) => c.sortOrder !== c.newOrder);
  const moved = all[index];

  await prisma.$transaction([
    ...changes.map((c) => prisma.courseCategory.update({ where: { id: c.id }, data: { sortOrder: c.newOrder } })),
    logAudit(prisma, {
      actorId: user.id,
      companyId: user.companyId,
      action: "CATEGORY_UPDATED",
      entityType: "CourseCategory",
      entityId: moved.id,
      metadata: {
        name: moved.name,
        reorder: direction,
        before: { sortOrder: moved.sortOrder },
        after: { sortOrder: target },
      },
    }),
  ]);

  revalidatePath(PATH);
  return { ok: true };
}
