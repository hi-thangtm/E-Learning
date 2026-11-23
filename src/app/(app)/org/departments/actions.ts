"use server";

import { revalidatePath } from "next/cache";
import { Prisma, type Role } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { wouldCreateCycle } from "@/lib/tree";
import { logAudit } from "@/lib/audit";

/**
 * Phòng ban — Admin tập đoàn (mọi công ty) và Admin công ty (chỉ công ty mình).
 * Quy tắc (docs/database.md): mã duy nhất trong công ty; phòng cha + trưởng phòng cùng công ty; không tạo vòng lặp;
 * trưởng phòng đang là LEARNER -> tự nâng MANAGER (gỡ thì không hạ); chỉ ẩn khi không còn phòng con đang dùng / nhân viên đang làm.
 */

const PATH = "/org/departments";
const ROLES: Role[] = ["GROUP_ADMIN", "COMPANY_ADMIN"];
const FIELDS = ["code", "name", "parentId", "managerId"];

const optionalId = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? null : v));

const departmentSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập mã phòng ban.")
    .transform((v) => v.toUpperCase())
    .pipe(
      z
        .string()
        .regex(
          /^[A-Z0-9_-]{1,20}$/,
          "Mã chỉ gồm chữ in hoa không dấu, số, gạch ngang hoặc gạch dưới (tối đa 20 ký tự, không có khoảng trắng).",
        ),
    ),
  name: z
    .string()
    .trim()
    .min(2, "Tên phòng ban tối thiểu 2 ký tự.")
    .max(100, "Tên phòng ban tối đa 100 ký tự."),
  parentId: optionalId,
  managerId: optionalId,
});

const idSchema = z.string().trim().min(1).max(50);

type DepartmentInput = z.infer<typeof departmentSchema>;

/** Người dùng có được thao tác trên công ty này không (không tin id từ trình duyệt). */
async function canAccessCompany(user: CurrentUser, companyId: string): Promise<boolean> {
  if (user.role === "GROUP_ADMIN") {
    return !!(await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } }));
  }
  return companyId === user.companyId;
}

function parseForm(formData: FormData) {
  return departmentSchema.safeParse({
    code: formData.get("code") ?? "",
    name: formData.get("name") ?? "",
    parentId: formData.get("parentId") ?? "",
    managerId: formData.get("managerId") ?? "",
  });
}

function fail(formData: FormData, errors: Record<string, string>): ActionState {
  return { errors, values: formValues(formData, FIELDS) };
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const duplicateMessage = (code: string) => `Mã phòng ban “${code}” đã có trong công ty này.`;

/**
 * Kiểm tra phòng cha + trưởng phòng theo công ty. Trả lỗi theo ô, hoặc thông tin trưởng phòng mới.
 * `departmentId` = phòng đang sửa (null khi thêm mới).
 */
async function validateRelations(
  companyId: string,
  departmentId: string | null,
  input: DepartmentInput,
  current?: { parentId: string | null; managerId: string | null },
): Promise<
  | { errors: Record<string, string> }
  | { manager: { id: string; employeeCode: string; fullName: string; role: Role } | null }
> {
  if (input.parentId && input.parentId !== current?.parentId) {
    const parent = await prisma.department.findUnique({
      where: { id: input.parentId },
      select: { companyId: true, isActive: true },
    });
    if (!parent || parent.companyId !== companyId) {
      return { errors: { parentId: "Phòng cha phải thuộc cùng công ty." } };
    }
    if (!parent.isActive) return { errors: { parentId: "Phòng cha đang bị ẩn, hãy chọn phòng khác." } };
  }

  if (departmentId && input.parentId) {
    const all = await prisma.department.findMany({ where: { companyId }, select: { id: true, parentId: true } });
    const parentOf = new Map(all.map((d) => [d.id, d.parentId]));
    if (wouldCreateCycle(departmentId, input.parentId, parentOf)) {
      return { errors: { parentId: "Không thể chọn chính phòng này hoặc phòng con / cháu của nó làm phòng cha." } };
    }
  }

  if (!input.managerId) return { manager: null };

  const manager = await prisma.user.findUnique({
    where: { id: input.managerId },
    select: { id: true, employeeCode: true, fullName: true, role: true, companyId: true, status: true },
  });
  if (!manager || manager.companyId !== companyId) {
    return { errors: { managerId: "Trưởng phòng phải là nhân viên của cùng công ty." } };
  }
  if (manager.status !== "ACTIVE" && manager.id !== current?.managerId) {
    return { errors: { managerId: "Trưởng phòng phải là nhân viên đang làm." } };
  }
  return { manager };
}

/** Ghi các thay đổi liên quan trưởng phòng mới trong transaction: nâng vai trò + audit. */
async function assignManager(
  tx: Prisma.TransactionClient,
  args: {
    actorId: string;
    companyId: string;
    department: { id: string; code: string };
    manager: { id: string; employeeCode: string; fullName: string; role: Role };
    previousManagerId: string | null;
  },
) {
  const promote = args.manager.role === "LEARNER";
  if (promote) {
    // Đổi vai trò → huỷ phiên cũ (Việc 29A)
    await tx.user.update({ where: { id: args.manager.id }, data: { role: "MANAGER", sessionsValidAfter: new Date() } });
  }
  await logAudit(tx, {
      actorId: args.actorId,
      companyId: args.companyId,
      action: "DEPARTMENT_MANAGER_ASSIGNED",
      entityType: "Department",
      entityId: args.department.id,
      metadata: {
        departmentCode: args.department.code,
        managerId: args.manager.id,
        employeeCode: args.manager.employeeCode,
        previousManagerId: args.previousManagerId,
        ...(promote && { roleChange: { from: "LEARNER", to: "MANAGER" } }),
      },
    });
  return promote;
}

function successMessage(base: string, promoted: { fullName: string } | null) {
  return promoted ? `${base} ${promoted.fullName} đã được nâng lên vai trò Quản lý.` : base;
}

export async function createDepartmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(ROLES);

  // Admin công ty luôn thao tác trên công ty của mình, bỏ qua giá trị gửi lên
  const requestedCompanyId = user.role === "GROUP_ADMIN" ? String(formData.get("companyId") ?? "") : user.companyId;
  const companyId = idSchema.safeParse(requestedCompanyId);
  if (!companyId.success || !(await canAccessCompany(user, companyId.data))) {
    return { message: "Bạn không có quyền thêm phòng ban cho công ty này." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) return fail(formData, fieldErrors(parsed.error));
  const input = parsed.data;

  const existing = await prisma.department.findUnique({
    where: { companyId_code: { companyId: companyId.data, code: input.code } },
    select: { id: true },
  });
  if (existing) return fail(formData, { code: duplicateMessage(input.code) });

  const relations = await validateRelations(companyId.data, null, input);
  if ("errors" in relations) return fail(formData, relations.errors);
  const { manager } = relations;

  let promoted = false;
  try {
    promoted = await prisma.$transaction(async (tx) => {
      const department = await tx.department.create({
        data: {
          companyId: companyId.data,
          code: input.code,
          name: input.name,
          parentId: input.parentId,
          managerId: manager?.id ?? null,
        },
      });
      await logAudit(tx, {
          actorId: user.id,
          companyId: companyId.data,
          action: "DEPARTMENT_CREATED",
          entityType: "Department",
          entityId: department.id,
          metadata: { code: input.code, name: input.name, parentId: input.parentId, managerId: manager?.id ?? null },
        });
      if (!manager) return false;
      return assignManager(tx, {
        actorId: user.id,
        companyId: companyId.data,
        department,
        manager,
        previousManagerId: null,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(formData, { code: duplicateMessage(input.code) });
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: successMessage(`Đã thêm phòng ban ${input.code}.`, promoted ? manager : null) };
}

export async function updateDepartmentAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole(ROLES);

  const id = idSchema.safeParse(formData.get("id") ?? "");
  if (!id.success) return { message: "Không xác định được phòng ban cần sửa." };

  const current = await prisma.department.findUnique({
    where: { id: id.data },
    select: { id: true, companyId: true, code: true, name: true, parentId: true, managerId: true },
  });
  // Không tiết lộ phòng ban của công ty khác: báo chung "không tồn tại"
  if (!current || !(await canAccessCompany(user, current.companyId))) {
    return { message: "Phòng ban không tồn tại hoặc bạn không có quyền sửa." };
  }

  const parsed = parseForm(formData);
  if (!parsed.success) return fail(formData, fieldErrors(parsed.error));
  const input = parsed.data;

  if (
    current.code === input.code &&
    current.name === input.name &&
    current.parentId === input.parentId &&
    current.managerId === input.managerId
  ) {
    return { ok: true, message: "Không có thay đổi nào." };
  }

  if (input.code !== current.code) {
    const duplicate = await prisma.department.findUnique({
      where: { companyId_code: { companyId: current.companyId, code: input.code } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== current.id) return fail(formData, { code: duplicateMessage(input.code) });
  }

  const relations = await validateRelations(current.companyId, current.id, input, current);
  if ("errors" in relations) return fail(formData, relations.errors);
  const { manager } = relations;
  const managerChanged = (manager?.id ?? null) !== current.managerId;

  let promoted = false;
  try {
    promoted = await prisma.$transaction(async (tx) => {
      await tx.department.update({
        where: { id: current.id },
        data: { code: input.code, name: input.name, parentId: input.parentId, managerId: manager?.id ?? null },
      });
      await logAudit(tx, {
          actorId: user.id,
          companyId: current.companyId,
          action: "DEPARTMENT_UPDATED",
          entityType: "Department",
          entityId: current.id,
          metadata: {
            before: { code: current.code, name: current.name, parentId: current.parentId, managerId: current.managerId },
            after: { code: input.code, name: input.name, parentId: input.parentId, managerId: manager?.id ?? null },
          },
        });
      // Gỡ trưởng phòng (manager = null): KHÔNG hạ vai trò, chỉ ghi trong DEPARTMENT_UPDATED
      if (!manager || !managerChanged) return false;
      return assignManager(tx, {
        actorId: user.id,
        companyId: current.companyId,
        department: { id: current.id, code: input.code },
        manager,
        previousManagerId: current.managerId,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) return fail(formData, { code: duplicateMessage(input.code) });
    throw error;
  }

  revalidatePath(PATH);
  return { ok: true, message: successMessage(`Đã cập nhật phòng ban ${input.code}.`, promoted ? manager : null) };
}

export async function toggleDepartmentAction(departmentId: string): Promise<ActionState> {
  const user = await requireRole(ROLES);

  const id = idSchema.safeParse(departmentId);
  if (!id.success) return { message: "Không xác định được phòng ban." };

  const current = await prisma.department.findUnique({
    where: { id: id.data },
    select: {
      id: true,
      companyId: true,
      code: true,
      isActive: true,
      parent: { select: { code: true, isActive: true } },
      _count: {
        select: {
          children: { where: { isActive: true } },
          users: { where: { status: "ACTIVE" } },
        },
      },
    },
  });
  if (!current || !(await canAccessCompany(user, current.companyId))) {
    return { message: "Phòng ban không tồn tại hoặc bạn không có quyền sửa." };
  }

  const isActive = !current.isActive;

  if (!isActive) {
    const reasons: string[] = [];
    if (current._count.children > 0) reasons.push(`${current._count.children} phòng con đang dùng`);
    if (current._count.users > 0) reasons.push(`${current._count.users} nhân viên đang làm`);
    if (reasons.length > 0) {
      return { message: `Không thể ẩn ${current.code}: còn ${reasons.join(" và ")}.` };
    }
  } else if (current.parent && !current.parent.isActive) {
    return { message: `Phòng cha ${current.parent.code} đang bị ẩn. Hãy hiện phòng cha trước.` };
  }

  await prisma.$transaction([
    prisma.department.update({ where: { id: current.id }, data: { isActive } }),
    logAudit(prisma, {
        actorId: user.id,
        companyId: current.companyId,
        action: "DEPARTMENT_TOGGLED",
        entityType: "Department",
        entityId: current.id,
        metadata: { code: current.code, isActive },
      }),
  ]);

  revalidatePath(PATH);
  return { ok: true, message: isActive ? `Đã hiện lại phòng ban ${current.code}.` : `Đã ẩn phòng ban ${current.code}.` };
}
