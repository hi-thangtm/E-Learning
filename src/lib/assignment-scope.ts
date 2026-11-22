import "server-only";
import type { Prisma } from "@prisma/client";
import { courseVisibleWhere, getGroupCompanyId } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { buildChildrenMap, getDescendantIds } from "@/lib/tree";

/**
 * Phạm vi giao khoá (docs/database.md — Quy tắc 1, 3). Chỉ chạy ở server.
 * - Khoá giao được: PUBLISHED và nằm trong phạm vi xem khoá của người giao.
 * - Người học được giao: khoá của công ty con -> chỉ người công ty đó; khoá của công ty tổng -> mọi công ty
 *   (Admin công ty vẫn chỉ giao cho người công ty mình).
 * - Lượt giao xem được: Admin công ty chỉ lượt của người công ty mình.
 */

export async function assignableCoursesWhere(actor: CurrentUser): Promise<Prisma.CourseWhereInput> {
  return { AND: [await courseVisibleWhere(actor), { status: "PUBLISHED" }] };
}

/** Công ty có người học được giao khoá này ("all" = mọi công ty). */
export async function learnerCompaniesForCourse(
  actor: CurrentUser,
  course: { ownerCompanyId: string },
): Promise<string[] | "all"> {
  const groupId = await getGroupCompanyId();
  if (course.ownerCompanyId !== groupId) {
    // Khoá của công ty con: chỉ trong công ty đó (Admin công ty khác không thấy khoá này từ đầu)
    if (actor.role !== "GROUP_ADMIN" && course.ownerCompanyId !== actor.companyId) return [];
    return [course.ownerCompanyId];
  }
  return actor.role === "GROUP_ADMIN" ? "all" : [actor.companyId];
}

/** Người đang làm, công ty đang hoạt động, thuộc các công ty cho phép. */
export function activeLearnerWhere(companies: string[] | "all"): Prisma.UserWhereInput {
  return {
    status: "ACTIVE",
    company: { isActive: true },
    ...(companies !== "all" && { companyId: { in: companies } }),
  };
}

export function enrollmentScopeWhere(actor: CurrentUser): Prisma.EnrollmentWhereInput {
  return actor.role === "GROUP_ADMIN" ? {} : { user: { companyId: actor.companyId } };
}

/** Phòng ban + mọi phòng con / cháu (cùng công ty). */
export async function departmentWithChildren(departmentId: string): Promise<string[]> {
  const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { companyId: true } });
  if (!dept) return [];
  const all = await prisma.department.findMany({ where: { companyId: dept.companyId }, select: { id: true, parentId: true } });
  return [departmentId, ...getDescendantIds(departmentId, buildChildrenMap(all))];
}

export type RuleTarget = {
  targetCompanyId: string | null;
  departmentId: string | null;
  includeSubDepartments: boolean;
  positionId: string | null;
};

/** Điều kiện tìm người khớp quy tắc (VÀ; trống = không lọc), chỉ người đang làm + công ty hoạt động. */
export async function ruleUsersWhere(rule: RuleTarget, courseOwnerCompanyId: string): Promise<Prisma.UserWhereInput> {
  const groupId = await getGroupCompanyId();
  // Khoá công ty con: luôn giới hạn trong công ty đó
  const companyId = courseOwnerCompanyId !== groupId ? courseOwnerCompanyId : rule.targetCompanyId;
  const departmentIds = rule.departmentId
    ? rule.includeSubDepartments
      ? await departmentWithChildren(rule.departmentId)
      : [rule.departmentId]
    : null;
  return {
    status: "ACTIVE",
    company: { isActive: true },
    ...(companyId && { companyId }),
    ...(departmentIds && { departmentId: { in: departmentIds } }),
    ...(rule.positionId && { positionId: rule.positionId }),
  };
}
