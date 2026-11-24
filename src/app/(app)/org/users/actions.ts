"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { onUserOrgChanged } from "@/lib/assignment";
import { generateTempPassword } from "@/lib/password";
import {
  EMPLOYEE_CODE_MESSAGE,
  EMPLOYEE_CODE_REGEX,
  fromDbDate,
  isValidHireDate,
  PHONE_MESSAGE,
  PHONE_REGEX,
  toDbDate,
} from "@/lib/user-rules";
import type { CreateUserState, ResetPasswordState } from "./types";
import { logAudit } from "@/lib/audit";

/**
 * Người dùng — Admin tập đoàn (mọi công ty) và Admin công ty (chỉ công ty mình).
 * Quy tắc (docs/database.md — Quy tắc 1, 5):
 * - Admin công ty chỉ thấy / sửa người của công ty mình, không sửa người đang là GROUP_ADMIN,
 *   chỉ gán LEARNER / MANAGER / CONTENT_EDITOR / COMPANY_ADMIN.
 * - GROUP_ADMIN chỉ gán cho người thuộc công ty tổng.
 * - Không ai tự đổi vai trò / công ty của chính mình.
 * - Chuyển công ty: chỉ Admin tập đoàn; xoá phòng ban cũ, gỡ khỏi trưởng phòng các phòng của công ty cũ.
 * - Mã nhân viên in hoa, duy nhất toàn tập đoàn. Tạo mới: mustChangePassword = true.
 * Không bao giờ ghi mật khẩu vào audit_logs.
 */

const ADMIN_ROLES: Role[] = ["GROUP_ADMIN", "COMPANY_ADMIN"];
const ALL_ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR", "MANAGER", "LEARNER"] as const;
const COMPANY_ADMIN_ASSIGNABLE: Role[] = ["LEARNER", "MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN"];

// Các ô trả lại khi lỗi (không bao giờ trả lại mật khẩu)
const FIELDS = [
  "employeeCode",
  "fullName",
  "email",
  "phone",
  "companyId",
  "departmentId",
  "positionId",
  "hireDate",
  "role",
  "passwordMode",
];

const optionalId = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? null : v));

const userSchema = z.object({
  employeeCode: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã nhân viên.")
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(EMPLOYEE_CODE_REGEX, EMPLOYEE_CODE_MESSAGE),
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
    .refine((v) => v === "" || z.email().safeParse(v).success, "Email không hợp lệ.")
    .transform((v) => (v === "" ? null : v.toLowerCase())),
  phone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_REGEX.test(v), PHONE_MESSAGE)
    .transform((v) => (v === "" ? null : v)),
  companyId: optionalId,
  departmentId: optionalId,
  positionId: optionalId,
  hireDate: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidHireDate(v), "Ngày vào làm không hợp lệ.")
    .transform((v) => (v === "" ? null : v)),
  role: z.enum(ALL_ROLES, { error: "Vui lòng chọn vai trò." }),
});

const passwordSchema = z
  .string()
  .min(8, "Mật khẩu tối thiểu 8 ký tự.")
  .max(100, "Mật khẩu tối đa 100 ký tự.")
  .regex(/[A-Za-z]/, "Mật khẩu phải có ít nhất 1 chữ cái.")
  .regex(/\d/, "Mật khẩu phải có ít nhất 1 chữ số.");

const idSchema = z.string().trim().min(1).max(50);

type UserInput = z.infer<typeof userSchema>;

function parseUser(formData: FormData) {
  return userSchema.safeParse({
    employeeCode: formData.get("employeeCode") ?? "",
    fullName: formData.get("fullName") ?? "",
    email: formData.get("email") ?? "",
    phone: formData.get("phone") ?? "",
    companyId: formData.get("companyId") ?? "",
    departmentId: formData.get("departmentId") ?? "",
    positionId: formData.get("positionId") ?? "",
    hireDate: formData.get("hireDate") ?? "",
    role: formData.get("role") ?? "",
  });
}

function fail(formData: FormData, errors: Record<string, string>, message?: string): ActionState {
  return { errors, message, values: formValues(formData, FIELDS) };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const duplicateCode = (code: string) => ({ employeeCode: `Mã nhân viên “${code}” đã được dùng trong tập đoàn.` });

type OrgResolved = {
  company: { id: string; code: string; parentId: string | null };
  department: { id: string; code: string } | null;
  position: { id: string; code: string } | null;
};

/**
 * Kiểm tra công ty / phòng ban / chức danh / vai trò theo người thao tác (không tin dữ liệu từ trình duyệt).
 * `current` = giá trị hiện tại khi sửa: mục đã bị ẩn / tạm ngưng vẫn được giữ nguyên nếu không đổi.
 */
async function resolveOrg(
  actor: CurrentUser,
  input: UserInput,
  current?: { companyId: string; departmentId: string | null; positionId: string | null },
): Promise<{ errors: Record<string, string> } | OrgResolved> {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  // Admin công ty: luôn là công ty mình, bỏ qua giá trị gửi lên
  const companyId = isGroupAdmin ? input.companyId : actor.companyId;
  if (!companyId) return { errors: { companyId: "Vui lòng chọn công ty." } };

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, code: true, parentId: true, isActive: true },
  });
  if (!company) return { errors: { companyId: "Công ty không tồn tại." } };
  if (!company.isActive && company.id !== current?.companyId) {
    return { errors: { companyId: "Công ty đang tạm ngưng, không thêm hoặc chuyển nhân viên vào được." } };
  }

  let department: OrgResolved["department"] = null;
  if (input.departmentId) {
    const d = await prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true, code: true, companyId: true, isActive: true },
    });
    if (!d || d.companyId !== company.id) {
      return { errors: { departmentId: "Phòng ban phải thuộc công ty đã chọn." } };
    }
    if (!d.isActive && d.id !== current?.departmentId) {
      return { errors: { departmentId: "Phòng ban này đã bị ẩn, hãy chọn phòng khác." } };
    }
    department = { id: d.id, code: d.code };
  }

  let position: OrgResolved["position"] = null;
  if (input.positionId) {
    const p = await prisma.position.findUnique({
      where: { id: input.positionId },
      select: { id: true, code: true, isActive: true },
    });
    if (!p) return { errors: { positionId: "Chức danh không tồn tại." } };
    if (!p.isActive && p.id !== current?.positionId) {
      return { errors: { positionId: "Chức danh này đã bị ẩn, hãy chọn chức danh khác." } };
    }
    position = { id: p.id, code: p.code };
  }

  if (!isGroupAdmin && !COMPANY_ADMIN_ASSIGNABLE.includes(input.role)) {
    return { errors: { role: "Admin công ty không được gán vai trò Admin tập đoàn." } };
  }
  if (input.role === "GROUP_ADMIN" && company.parentId !== null) {
    return { errors: { role: "Vai trò Admin tập đoàn chỉ gán cho người thuộc công ty tổng." } };
  }

  return { company: { id: company.id, code: company.code, parentId: company.parentId }, department, position };
}

const NO_ACCESS = "Người dùng không tồn tại hoặc bạn không có quyền.";

/**
 * Phạm vi (Quy tắc 1): Admin công ty chỉ thao tác người cùng công ty, không phải Admin tập đoàn,
 * và KHÔNG phải Admin công ty khác (sửa / đặt lại mật khẩu / khoá / mở khoá / xoá khoá đăng nhập / đổi vai trò
 * người đang là COMPANY_ADMIN → chỉ GROUP_ADMIN — Việc 29B #15). Ngoại lệ: tự sửa hồ sơ của chính mình
 * (tự đổi vai trò / công ty, tự khoá, tự đặt lại mật khẩu đã bị chặn riêng ở từng action).
 */
function canManageUser(actor: CurrentUser, target: { id: string; companyId: string; role: Role }): boolean {
  if (actor.role === "GROUP_ADMIN") return true;
  if (target.companyId !== actor.companyId || target.role === "GROUP_ADMIN") return false;
  return target.role !== "COMPANY_ADMIN" || target.id === actor.id;
}

function revalidateAll() {
  revalidatePath("/org/users");
  revalidatePath("/org/users/[id]", "page");
  revalidatePath("/org/departments");
  revalidatePath("/system/companies");
}

// ---------------------------------------------------------------------------------------------

export async function createUserAction(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  const actor = await requireRole(ADMIN_ROLES);

  const parsed = parseUser(formData);
  if (!parsed.success) return fail(formData, fieldErrors(parsed.error));
  const input = parsed.data;

  // Mật khẩu ban đầu: mặc định tự sinh; "manual" = admin tự nhập
  const manual = formData.get("passwordMode") === "manual";
  let password: string;
  if (manual) {
    const pw = passwordSchema.safeParse(formData.get("password") ?? "");
    if (!pw.success) return fail(formData, { password: pw.error.issues[0]?.message ?? "Mật khẩu không hợp lệ." });
    password = pw.data;
  } else {
    password = generateTempPassword();
  }

  const org = await resolveOrg(actor, input);
  if ("errors" in org) return fail(formData, org.errors);

  const existing = await prisma.user.findUnique({ where: { employeeCode: input.employeeCode }, select: { id: true } });
  if (existing) return fail(formData, duplicateCode(input.employeeCode));

  const passwordHash = await bcrypt.hash(password, 12);

  let userId: string;
  try {
    userId = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          companyId: org.company.id,
          departmentId: org.department?.id ?? null,
          positionId: org.position?.id ?? null,
          hireDate: toDbDate(input.hireDate),
          role: input.role,
          passwordHash,
          mustChangePassword: true,
        },
        select: { id: true },
      });
      await logAudit(tx, {
          actorId: actor.id,
          companyId: org.company.id,
          action: "USER_CREATED",
          entityType: "User",
          entityId: created.id,
          metadata: {
            employeeCode: input.employeeCode,
            fullName: input.fullName,
            role: input.role,
            companyCode: org.company.code,
            departmentCode: org.department?.code ?? null,
            positionCode: org.position?.code ?? null,
            passwordMode: manual ? "manual" : "generated",
          },
        });
      return created.id;
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(formData, duplicateCode(input.employeeCode));
    throw error;
  }

  // Quy tắc 3: tạo nhân viên -> chạy quy tắc giao khoá
  await onUserOrgChanged(userId);
  revalidateAll();

  return {
    ok: true,
    message: `Đã thêm người dùng ${input.employeeCode}.`,
    created: { employeeCode: input.employeeCode, fullName: input.fullName, password },
  };
}

// ---------------------------------------------------------------------------------------------

export async function updateUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(ADMIN_ROLES);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const id = idSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) return { message: "Không xác định được người dùng cần sửa." };

  const target = await prisma.user.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      phone: true,
      companyId: true,
      departmentId: true,
      positionId: true,
      hireDate: true,
      role: true,
      larkUserId: true,
      company: { select: { code: true } },
      department: { select: { code: true } },
      position: { select: { code: true } },
    },
  });
  if (!target || !canManageUser(actor, target)) return { message: NO_ACCESS };

  const parsed = parseUser(formData);
  if (!parsed.success) return fail(formData, fieldErrors(parsed.error));
  // Người liên kết Lark (Việc L1): các trường nguồn Lark giữ nguyên — chỉ sửa được vai trò, chức danh; không chuyển công ty bằng tay
  const input = target.larkUserId
    ? {
        ...parsed.data,
        employeeCode: target.employeeCode,
        fullName: target.fullName,
        email: target.email,
        phone: target.phone,
        hireDate: fromDbDate(target.hireDate),
        companyId: target.companyId,
        departmentId: target.departmentId,
      }
    : parsed.data;

  const isSelf = target.id === actor.id;
  const requestedCompanyId = isGroupAdmin ? input.companyId : target.companyId;

  if (isSelf && input.role !== target.role) {
    return fail(formData, { role: "Bạn không thể tự đổi vai trò của chính mình." });
  }
  if (isSelf && requestedCompanyId !== target.companyId) {
    return fail(formData, { companyId: "Bạn không thể tự chuyển công ty của chính mình." });
  }

  const companyChanged = requestedCompanyId !== target.companyId;
  if (companyChanged && formData.get("confirmTransfer") !== "1") {
    return fail(formData, {}, "Vui lòng xác nhận chuyển công ty.");
  }

  const org = await resolveOrg(actor, input, target);
  if ("errors" in org) return fail(formData, org.errors);

  if (input.employeeCode !== target.employeeCode) {
    const duplicate = await prisma.user.findUnique({
      where: { employeeCode: input.employeeCode },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== target.id) return fail(formData, duplicateCode(input.employeeCode));
  }

  // --- So sánh để chỉ ghi phần thay đổi ---
  const before = {
    employeeCode: target.employeeCode,
    fullName: target.fullName,
    email: target.email,
    phone: target.phone,
    hireDate: fromDbDate(target.hireDate),
    department: target.department?.code ?? null,
    position: target.position?.code ?? null,
  };
  const after = {
    employeeCode: input.employeeCode,
    fullName: input.fullName,
    email: input.email,
    phone: input.phone,
    hireDate: input.hireDate,
    department: org.department?.code ?? null,
    position: org.position?.code ?? null,
  };
  const changedKeys = (Object.keys(before) as (keyof typeof before)[]).filter((k) => before[k] !== after[k]);
  const departmentChanged = (org.department?.id ?? null) !== target.departmentId;
  const positionChanged = (org.position?.id ?? null) !== target.positionId;
  const roleChanged = input.role !== target.role;

  if (changedKeys.length === 0 && !roleChanged && !companyChanged && !departmentChanged && !positionChanged) {
    return { ok: true, message: "Không có thay đổi nào." };
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Chuyển công ty: gỡ khỏi trưởng phòng các phòng của công ty cũ
      let removedManagerOf: string[] = [];
      if (companyChanged) {
        const managed = await tx.department.findMany({
          where: { managerId: target.id, companyId: target.companyId },
          select: { code: true },
          orderBy: { code: "asc" },
        });
        removedManagerOf = managed.map((d) => d.code);
        if (managed.length > 0) {
          await tx.department.updateMany({
            where: { managerId: target.id, companyId: target.companyId },
            data: { managerId: null },
          });
        }
      }

      await tx.user.update({
        where: { id: target.id },
        data: {
          employeeCode: input.employeeCode,
          fullName: input.fullName,
          email: input.email,
          phone: input.phone,
          hireDate: toDbDate(input.hireDate),
          companyId: org.company.id,
          departmentId: org.department?.id ?? null,
          positionId: org.position?.id ?? null,
          role: input.role,
          // Đổi vai trò / chuyển công ty -> huỷ mọi phiên đang mở (Việc 29A)
          ...((roleChanged || companyChanged) && { sessionsValidAfter: new Date() }),
        },
      });

      const base = { actorId: actor.id, companyId: org.company.id, entityType: "User" as const, entityId: target.id };

      if (changedKeys.length > 0) {
        await logAudit(tx, {
            ...base,
            action: "USER_UPDATED",
            metadata: {
              employeeCode: input.employeeCode,
              before: Object.fromEntries(changedKeys.map((k) => [k, before[k]])),
              after: Object.fromEntries(changedKeys.map((k) => [k, after[k]])),
            },
          });
      }
      if (roleChanged) {
        await logAudit(tx, {
            ...base,
            action: "USER_ROLE_CHANGED",
            metadata: { employeeCode: input.employeeCode, from: target.role, to: input.role },
          });
      }
      if (companyChanged) {
        await logAudit(tx, {
            ...base,
            action: "USER_TRANSFERRED",
            metadata: {
              employeeCode: input.employeeCode,
              fromCompany: target.company.code,
              toCompany: org.company.code,
              fromCompanyId: target.companyId,
              removedManagerOf,
            },
          });
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(formData, duplicateCode(input.employeeCode));
    throw error;
  }

  if (companyChanged || departmentChanged || positionChanged) {
    await onUserOrgChanged(target.id);
  }
  revalidateAll();

  return {
    ok: true,
    message: companyChanged
      ? `Đã chuyển ${input.employeeCode} sang công ty ${org.company.code}.`
      : `Đã cập nhật người dùng ${input.employeeCode}.`,
  };
}

// ---------------------------------------------------------------------------------------------
// Khoá / mở khoá / mở khoá tạm / đặt lại mật khẩu (Việc 6B)

/** Đọc người dùng cần thao tác + kiểm tra phạm vi. Không tin id gửi từ trình duyệt. */
async function findTargetInScope(actor: CurrentUser, userId: string) {
  const id = idSchema.safeParse(userId);
  if (!id.success) return null;
  const target = await prisma.user.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      companyId: true,
      role: true,
      status: true,
      lockedUntil: true,
      company: { select: { isActive: true } },
      managedDepartments: { select: { code: true }, orderBy: { code: "asc" } },
    },
  });
  return target && canManageUser(actor, target) ? target : null;
}

export async function lockUserAction(userId: string): Promise<ActionState> {
  const actor = await requireRole(ADMIN_ROLES);
  const target = await findTargetInScope(actor, userId);
  if (!target) return { message: NO_ACCESS };
  if (target.id === actor.id) return { message: "Bạn không thể tự khoá tài khoản của chính mình." };
  if (target.status === "INACTIVE") return { message: `Tài khoản ${target.employeeCode} đã bị khoá từ trước.` };

  const managerOf = target.managedDepartments.map((d) => d.code);

  // Giữ nguyên vị trí trưởng phòng — admin tự chỉ định người khác ở trang Phòng ban
  await prisma.$transaction([
    // Khoá tài khoản -> huỷ mọi phiên đang mở (Việc 29A)
    prisma.user.update({ where: { id: target.id }, data: { status: "INACTIVE", inactiveSource: "ADMIN", sessionsValidAfter: new Date() } }),
    logAudit(prisma, {
        actorId: actor.id,
        companyId: target.companyId,
        action: "USER_LOCKED",
        entityType: "User",
        entityId: target.id,
        metadata: { employeeCode: target.employeeCode, managerOf },
      }),
  ]);

  revalidateAll();
  return {
    ok: true,
    message:
      managerOf.length > 0
        ? `Đã khoá ${target.employeeCode}. Nhớ chỉ định trưởng phòng khác cho: ${managerOf.join(", ")}.`
        : `Đã khoá tài khoản ${target.employeeCode}.`,
  };
}

export async function unlockUserAction(userId: string): Promise<ActionState> {
  const actor = await requireRole(ADMIN_ROLES);
  const target = await findTargetInScope(actor, userId);
  if (!target) return { message: NO_ACCESS };
  if (target.status === "ACTIVE") return { message: `Tài khoản ${target.employeeCode} đang hoạt động.` };

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      data: { status: "ACTIVE", inactiveSource: null, failedLoginCount: 0, lockedUntil: null },
    }),
    logAudit(prisma, {
        actorId: actor.id,
        companyId: target.companyId,
        action: "USER_UNLOCKED",
        entityType: "User",
        entityId: target.id,
        metadata: { employeeCode: target.employeeCode, kind: "ACCOUNT" },
      }),
  ]);

  // Mở khoá: người này có thể khớp quy tắc giao tự động mới tạo trong lúc bị khoá
  await onUserOrgChanged(target.id);
  revalidateAll();
  return {
    ok: true,
    message: target.company.isActive
      ? `Đã mở khoá tài khoản ${target.employeeCode}.`
      : `Đã mở khoá ${target.employeeCode}, nhưng công ty của người này đang tạm ngưng nên vẫn chưa đăng nhập được.`,
  };
}

/** Nút “Mở khoá tạm”: gỡ khoá do sai mật khẩu nhiều lần (lockedUntil), không đổi trạng thái tài khoản. */
export async function clearLoginLockAction(userId: string): Promise<ActionState> {
  const actor = await requireRole(ADMIN_ROLES);
  const target = await findTargetInScope(actor, userId);
  if (!target) return { message: NO_ACCESS };
  if (!target.lockedUntil || target.lockedUntil <= new Date()) {
    return { message: `Tài khoản ${target.employeeCode} không bị khoá tạm.` };
  }

  await prisma.$transaction([
    prisma.user.update({ where: { id: target.id }, data: { failedLoginCount: 0, lockedUntil: null } }),
    logAudit(prisma, {
        actorId: actor.id,
        companyId: target.companyId,
        action: "USER_UNLOCKED",
        entityType: "User",
        entityId: target.id,
        metadata: { employeeCode: target.employeeCode, kind: "LOGIN_LOCK" },
      }),
  ]);

  revalidateAll();
  return { ok: true, message: `Đã mở khoá tạm cho ${target.employeeCode}.` };
}

export async function resetPasswordAction(userId: string): Promise<ResetPasswordState> {
  const actor = await requireRole(ADMIN_ROLES);
  const target = await findTargetInScope(actor, userId);
  if (!target) return { message: NO_ACCESS };
  if (target.id === actor.id) {
    return { message: "Hãy dùng chức năng “Đổi mật khẩu” để đổi mật khẩu của chính bạn." };
  }

  const password = generateTempPassword();
  const passwordHash = await bcrypt.hash(password, 12);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: target.id },
      // Đặt lại mật khẩu -> huỷ mọi phiên đang mở (Việc 29A)
      data: { passwordHash, passwordSet: true, mustChangePassword: true, failedLoginCount: 0, lockedUntil: null, sessionsValidAfter: new Date() },
    }),
    // Không ghi mật khẩu vào nhật ký
    logAudit(prisma, {
        actorId: actor.id,
        companyId: target.companyId,
        action: "USER_PASSWORD_RESET",
        entityType: "User",
        entityId: target.id,
        metadata: { employeeCode: target.employeeCode },
      }),
  ]);

  revalidateAll();
  return { ok: true, message: `Đã đặt lại mật khẩu cho ${target.employeeCode}.`, password };
}
