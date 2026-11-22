import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { buildChildrenMap, getDescendantIds } from "@/lib/tree";

/**
 * Phạm vi “Đội” (docs/database.md — Quy tắc 1; feature-spec mục 3 và 5). CHỈ chạy ở server.
 * Dùng ở MỌI truy vấn của Đội của tôi (Việc 26) và Báo cáo (Việc 27).
 *
 * - MANAGER: nhân viên thuộc các phòng mình làm trưởng (`departments.managerId = user.id`) VÀ mọi phòng con / cháu
 *   (duyệt cây phòng ban của công ty, kể cả phòng đã ẩn). Không làm trưởng phòng nào → phạm vi RỖNG.
 * - COMPANY_ADMIN: mọi nhân viên công ty mình.
 * - GROUP_ADMIN: mọi nhân viên toàn tập đoàn, hoặc 1 công ty nếu truyền `companyId`.
 * - Luôn chỉ người đang làm (`status = ACTIVE`) thuộc công ty đang hoạt động.
 * - Vai trò khác: phạm vi rỗng.
 */

export type TeamActor = { id: string; role: Role; companyId: string };

export type TeamScope = {
  /** Điều kiện Prisma cho bảng User */
  where: Prisma.UserWhereInput;
  /** Phòng ban trong phạm vi (MANAGER); null = không giới hạn theo phòng (admin) */
  departmentIds: string[] | null;
  /** Công ty đang xem (null = toàn tập đoàn) */
  companyId: string | null;
  /** Không có ai trong phạm vi do không làm trưởng phòng nào (MANAGER) / vai trò không có quyền */
  empty: boolean;
};

const ACTIVE_USER: Prisma.UserWhereInput = { status: "ACTIVE", company: { isActive: true } };
const NOBODY: Prisma.UserWhereInput = { id: { in: [] } };

/** Các phòng MANAGER làm trưởng + mọi phòng con (theo cây phòng ban của các công ty liên quan). */
async function managedDepartmentIds(userId: string): Promise<string[]> {
  const heads = await prisma.department.findMany({ where: { managerId: userId }, select: { id: true, companyId: true } });
  if (heads.length === 0) return [];
  const all = await prisma.department.findMany({
    where: { companyId: { in: [...new Set(heads.map((h) => h.companyId))] } },
    select: { id: true, parentId: true },
  });
  const children = buildChildrenMap(all);
  const result = new Set<string>();
  for (const h of heads) {
    result.add(h.id);
    for (const id of getDescendantIds(h.id, children)) result.add(id);
  }
  return [...result];
}

/** Phạm vi đội của người đang thao tác (cache theo request). */
export const getTeamScope = cache(async (user: TeamActor, options: { companyId?: string | null } = {}): Promise<TeamScope> => {
  if (user.role === "GROUP_ADMIN") {
    const companyId = options.companyId || null;
    return { where: { ...ACTIVE_USER, ...(companyId && { companyId }) }, departmentIds: null, companyId, empty: false };
  }
  if (user.role === "COMPANY_ADMIN") {
    return { where: { ...ACTIVE_USER, companyId: user.companyId }, departmentIds: null, companyId: user.companyId, empty: false };
  }
  if (user.role === "MANAGER") {
    const departmentIds = await managedDepartmentIds(user.id);
    if (departmentIds.length === 0) return { where: NOBODY, departmentIds: [], companyId: user.companyId, empty: true };
    return { where: { ...ACTIVE_USER, departmentId: { in: departmentIds } }, departmentIds, companyId: user.companyId, empty: false };
  }
  return { where: NOBODY, departmentIds: [], companyId: null, empty: true };
});

/** Người `targetUserId` có thuộc đội của `user` không. */
export async function isUserInTeam(user: TeamActor, targetUserId: string): Promise<boolean> {
  if (!targetUserId || targetUserId.length > 50) return false;
  const scope = await getTeamScope(user);
  if (scope.empty) return false;
  const found = await prisma.user.findFirst({ where: { AND: [scope.where, { id: targetUserId }] }, select: { id: true } });
  return !!found;
}

/** Ngoài phạm vi đội → về danh sách nhân viên. */
export async function assertUserInTeam(user: TeamActor, targetUserId: string): Promise<void> {
  if (!(await isUserInTeam(user, targetUserId))) redirect("/team/members");
}
