"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole } from "@/lib/current-user";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";

/**
 * Công ty con — CHỈ Admin tập đoàn. Chỉ có 2 cấp: công ty tổng (parentId = NULL) → các công ty con.
 * Công ty tổng: chỉ sửa tên, không sửa mã, không tạm ngưng.
 * Tạm ngưng công ty -> nhân viên công ty đó không đăng nhập được (src/auth.ts, src/lib/current-user.ts).
 */

const PATH = "/system/companies";

const companySchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã công ty.")
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
    .min(2, "Tên công ty tối thiểu 2 ký tự.")
    .max(150, "Tên công ty tối đa 150 ký tự."),
});

const adminSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã nhân viên.")
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_.-]{2,30}$/,
          "Mã nhân viên chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới (2–30 ký tự).",
        ),
    ),
  fullName: z
    .string()
    .trim()
    .min(2, "Họ tên tối thiểu 2 ký tự.")
    .max(100, "Họ tên tối đa 100 ký tự."),
  email: z
    .string()
    .trim()
    .max(150, "Email tối đa 150 ký tự.")
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ."),
  password: z
    .string()
    .min(8, "Mật khẩu tạm tối thiểu 8 ký tự.")
    .max(100, "Mật khẩu tạm tối đa 100 ký tự.")
    .regex(/[A-Za-z]/, "Mật khẩu tạm phải có ít nhất 1 chữ cái.")
    .regex(/\d/, "Mật khẩu tạm phải có ít nhất 1 chữ số."),
});

const idSchema = z.string().trim().min(1).max(50);

const COMPANY_FIELDS = ["code", "name"];
// Không trả lại mật khẩu về trình duyệt
const ADMIN_FIELDS = ["employeeCode", "fullName", "email"];

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function duplicateCompanyCode(code: string, formData: FormData): ActionState {
  return {
    errors: { code: `Mã công ty “${code}” đã tồn tại.` },
    values: formValues(formData, COMPANY_FIELDS),
  };
}

function duplicateEmployeeCode(code: string, formData: FormData): ActionState {
  return {
    errors: { employeeCode: `Mã nhân viên “${code}” đã được dùng trong tập đoàn.` },
    values: formValues(formData, ADMIN_FIELDS),
  };
}

export async function createCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const parsed = companySchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData, COMPANY_FIELDS) };
  }
  const { code, name } = parsed.data;

  // Chỉ 2 cấp: công ty con luôn thuộc công ty tổng
  const parent = await prisma.company.findFirst({ where: { parentId: null }, select: { id: true } });
  if (!parent) return { message: "Chưa có công ty tổng trong hệ thống." };

  const existing = await prisma.company.findUnique({ where: { code }, select: { id: true } });
  if (existing) return duplicateCompanyCode(code, formData);

  try {
    await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({ data: { code, name, parentId: parent.id } });
      await logAudit(tx, {
          actorId: user.id,
          companyId: company.id,
          action: "COMPANY_CREATED",
          entityType: "Company",
          entityId: company.id,
          metadata: { code, name },
        });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateCompanyCode(code, formData);
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: `Đã thêm công ty con ${code}.` };
}

export async function updateCompanyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) return { message: "Không xác định được công ty cần sửa." };

  const current = await prisma.company.findUnique({
    where: { id: id.data },
    select: { id: true, code: true, name: true, parentId: true },
  });
  if (!current) return { message: "Công ty không tồn tại hoặc đã bị thay đổi." };

  const isGroup = current.parentId === null;

  const parsed = companySchema.safeParse({
    // Công ty tổng: không sửa mã -> luôn dùng mã hiện tại, bỏ qua giá trị gửi lên
    code: isGroup ? current.code : (formData.get("code") ?? ""),
    name: formData.get("name") ?? "",
  });
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData, COMPANY_FIELDS) };
  }
  const { code, name } = parsed.data;

  if (current.code === code && current.name === name) {
    return { ok: true, message: "Không có thay đổi nào." };
  }

  if (code !== current.code) {
    const duplicate = await prisma.company.findUnique({ where: { code }, select: { id: true } });
    if (duplicate && duplicate.id !== current.id) return duplicateCompanyCode(code, formData);
  }

  try {
    await prisma.$transaction([
      prisma.company.update({ where: { id: current.id }, data: { code, name } }),
      logAudit(prisma, {
          actorId: user.id,
          companyId: current.id,
          action: "COMPANY_UPDATED",
          entityType: "Company",
          entityId: current.id,
          metadata: {
            before: { code: current.code, name: current.name },
            after: { code, name },
          },
        }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateCompanyCode(code, formData);
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: `Đã cập nhật công ty ${code}.` };
}

export async function toggleCompanyAction(companyId: string): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const id = idSchema.safeParse(companyId);
  if (!id.success) return { message: "Không xác định được công ty." };

  const current = await prisma.company.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      code: true,
      parentId: true,
      isActive: true,
      _count: { select: { users: { where: { status: "ACTIVE" } } } },
    },
  });
  if (!current) return { message: "Công ty không tồn tại hoặc đã bị thay đổi." };
  if (current.parentId === null) return { message: "Không thể tạm ngưng công ty tổng." };

  const isActive = !current.isActive;

  await prisma.$transaction([
    prisma.company.update({ where: { id: current.id }, data: { isActive } }),
    logAudit(prisma, {
        actorId: user.id,
        companyId: current.id,
        action: isActive ? "COMPANY_ACTIVATED" : "COMPANY_SUSPENDED",
        entityType: "Company",
        entityId: current.id,
        metadata: { code: current.code, activeUsers: current._count.users },
      }),
  ]);

  revalidatePath(PATH);
  return {
    ok: true,
    message: isActive
      ? `Đã kích hoạt lại công ty ${current.code}.`
      : `Đã tạm ngưng công ty ${current.code}. Nhân viên của công ty sẽ không đăng nhập được.`,
  };
}

export async function createCompanyAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(["GROUP_ADMIN"]);

  const companyId = idSchema.safeParse(formData.get("companyId") ?? "");
  if (!companyId.success) return { message: "Không xác định được công ty." };

  // Chỉ tạo admin cho công ty con (không tin id gửi từ trình duyệt)
  const company = await prisma.company.findUnique({
    where: { id: companyId.data },
    select: { id: true, code: true, parentId: true },
  });
  if (!company || company.parentId === null) return { message: "Chỉ tạo được admin cho công ty con." };

  const parsed = adminSchema.safeParse({
    employeeCode: formData.get("employeeCode") ?? "",
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
  });
  if (!parsed.success) {
    return { errors: fieldErrors(parsed.error), values: formValues(formData, ADMIN_FIELDS) };
  }
  const { employeeCode, fullName, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { employeeCode }, select: { id: true } });
  if (existing) return duplicateEmployeeCode(employeeCode, formData);

  const passwordHash = await bcrypt.hash(password, 12);

  try {
    await prisma.$transaction(async (tx) => {
      const admin = await tx.user.create({
        data: {
          employeeCode,
          fullName,
          email: email || null,
          passwordHash,
          mustChangePassword: true,
          role: "COMPANY_ADMIN",
          companyId: company.id,
        },
      });
      await logAudit(tx, {
          actorId: user.id,
          companyId: company.id,
          action: "COMPANY_ADMIN_CREATED",
          entityType: "User",
          entityId: admin.id,
          metadata: { employeeCode, fullName, companyCode: company.code },
        });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return duplicateEmployeeCode(employeeCode, formData);
    throw error;
  }

  revalidatePath(PATH);
  return {
    ok: true,
    message: `Đã tạo tài khoản admin ${employeeCode} cho công ty ${company.code}. Người này phải đổi mật khẩu ở lần đăng nhập đầu.`,
  };
}
