import type { Role } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import type { UserFormOptions } from "./types";

/**
 * Danh mục công ty / phòng ban / chức danh trong phạm vi người đang thao tác (Quy tắc 1)
 * và danh sách lựa chọn cho form người dùng. Dùng ở trang danh sách và trang chi tiết (server).
 */

// Thứ tự hiển thị vai trò: thấp -> cao
export const ROLE_ORDER: Role[] = ["LEARNER", "MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"];
const COMPANY_ADMIN_ASSIGNABLE: Role[] = ["LEARNER", "MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN"];

/** Admin tập đoàn: mọi công ty; Admin công ty: chỉ công ty mình. Gồm cả mục đã ẩn / tạm ngưng (form tự lọc). */
export async function loadOrgCatalog(actor: CurrentUser) {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const [companies, departments, positions] = await Promise.all([
    prisma.company.findMany({
      where: isGroupAdmin ? {} : { id: actor.companyId },
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      select: { id: true, code: true, name: true, parentId: true, isActive: true },
    }),
    prisma.department.findMany({
      where: isGroupAdmin ? {} : { companyId: actor.companyId },
      orderBy: { code: "asc" },
      select: { id: true, companyId: true, parentId: true, code: true, name: true, isActive: true },
    }),
    prisma.position.findMany({
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);
  return { companies, departments, positions };
}

export type OrgCatalog = Awaited<ReturnType<typeof loadOrgCatalog>>;

export function buildUserFormOptions(
  actor: CurrentUser,
  catalog: OrgCatalog,
  /** Công ty chọn sẵn khi thêm mới (Admin tập đoàn: công ty đang lọc); bỏ trống = công ty tổng */
  preferredCompanyId?: string,
): UserFormOptions {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const groupCompany = catalog.companies.find((c) => c.parentId === null);

  return {
    isGroupAdmin,
    actorId: actor.id,
    defaultCompanyId: isGroupAdmin
      ? (preferredCompanyId ?? groupCompany?.id ?? actor.companyId)
      : actor.companyId,
    groupCompanyId: groupCompany?.id ?? "",
    companies: catalog.companies.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      isGroup: c.parentId === null,
      isActive: c.isActive,
    })),
    departments: catalog.departments,
    positions: catalog.positions,
    assignableRoles: isGroupAdmin ? ROLE_ORDER : COMPANY_ADMIN_ASSIGNABLE,
  };
}
