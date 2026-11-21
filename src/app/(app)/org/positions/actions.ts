"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";

/**
 * Chức danh dùng chung toàn tập đoàn — CHỈ Admin tập đoàn được thêm / sửa / ẩn hiện.
 * Mọi action kiểm tra quyền ở server bằng requireRole (không chỉ ẩn nút).
 */

const PATH = "/org/positions";

const positionSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã chức danh.")
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_-]{2,20}$/,
          "Mã chỉ gồm chữ in hoa không dấu, số, gạch ngang hoặc gạch dưới (2–20 ký tự, không có khoảng trắng).",
        ),
    ),
  name: z
    .string()
    .trim()
    .min(2, "Tên chức danh tối thiểu 2 ký tự.")
    .max(100, "Tên chức danh tối đa 100 ký tự."),
});

const idSchema = z.string().trim().min(1, "Thiếu mã bản ghi.").max(50);

const FIELDS = ["code", "name"];

function duplicateCode(code: string, formData: FormData): ActionState {
  return { errors: { code: `Mã chức danh “${code}” đã tồn tại.` }, values: formValues(formData, FIELDS) };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function createPositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const parsed = positionSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, FIELDS) };
  const { code, name } = parsed.data;

  const existing = await prisma.position.findUnique({ where: { code }, select: { id: true } });
  if (existing) return duplicateCode(code, formData);

  try {
    await prisma.$transaction(async (tx) => {
      const position = await tx.position.create({ data: { code, name } });
      await logAudit(tx, {
          actorId: user.id,
          companyId: user.companyId,
          action: "POSITION_CREATED",
          entityType: "Position",
          entityId: position.id,
          metadata: { code, name },
        });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateCode(code, formData);
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: `Đã thêm chức danh ${code}.` };
}

export async function updatePositionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) return { message: "Không xác định được chức danh cần sửa." };

  const parsed = positionSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, FIELDS) };
  const { code, name } = parsed.data;

  const current = await prisma.position.findUnique({
    where: { id: id.data },
    select: { id: true, code: true, name: true },
  });
  if (!current) return { message: "Chức danh không tồn tại hoặc đã bị thay đổi." };

  if (current.code === code && current.name === name) {
    return { ok: true, message: "Không có thay đổi nào." };
  }

  if (code !== current.code) {
    const duplicate = await prisma.position.findUnique({ where: { code }, select: { id: true } });
    if (duplicate && duplicate.id !== current.id) return duplicateCode(code, formData);
  }

  try {
    await prisma.$transaction([
      prisma.position.update({ where: { id: current.id }, data: { code, name } }),
      logAudit(prisma, {
          actorId: user.id,
          companyId: user.companyId,
          action: "POSITION_UPDATED",
          entityType: "Position",
          entityId: current.id,
          metadata: {
            before: { code: current.code, name: current.name },
            after: { code, name },
          },
        }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateCode(code, formData);
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: `Đã cập nhật chức danh ${code}.` };
}

export async function togglePositionAction(positionId: string): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(positionId);
  if (!id.success) return { message: "Không xác định được chức danh." };

  const current = await prisma.position.findUnique({
    where: { id: id.data },
    select: { id: true, code: true, isActive: true },
  });
  if (!current) return { message: "Chức danh không tồn tại hoặc đã bị thay đổi." };

  const isActive = !current.isActive;

  await prisma.$transaction([
    prisma.position.update({ where: { id: current.id }, data: { isActive } }),
    logAudit(prisma, {
        actorId: user.id,
        companyId: user.companyId,
        action: "POSITION_TOGGLED",
        entityType: "Position",
        entityId: current.id,
        metadata: { code: current.code, isActive },
      }),
  ]);

  revalidatePath(PATH);
  return {
    ok: true,
    message: isActive ? `Đã hiện lại chức danh ${current.code}.` : `Đã ẩn chức danh ${current.code}.`,
  };
}
