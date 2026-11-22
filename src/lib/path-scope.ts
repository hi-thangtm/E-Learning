import "server-only";
import type { Prisma } from "@prisma/client";
import { getGroupCompanyId } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Phạm vi lộ trình học (docs/database.md — Quy tắc 1), giống khoá học:
 * - GROUP_ADMIN: thấy và sửa mọi lộ trình.
 * - COMPANY_ADMIN / CONTENT_EDITOR: thấy + sửa lộ trình của công ty mình; XEM được lộ trình đã phát hành của công ty tổng.
 * Luôn lọc ngay trong câu truy vấn, không tin id gửi từ trình duyệt.
 */

type Actor = Pick<CurrentUser, "role" | "companyId">;

export async function pathVisibleWhere(actor: Actor): Promise<Prisma.LearningPathWhereInput> {
  if (actor.role === "GROUP_ADMIN") return {};
  const groupId = await getGroupCompanyId();
  return {
    OR: [
      { ownerCompanyId: actor.companyId },
      ...(groupId && groupId !== actor.companyId ? [{ ownerCompanyId: groupId, status: "PUBLISHED" as const }] : []),
    ],
  };
}

export function canEditPath(actor: Actor, path: { ownerCompanyId: string }): boolean {
  return actor.role === "GROUP_ADMIN" || path.ownerCompanyId === actor.companyId;
}

export async function findPathInScope<S extends Prisma.LearningPathSelect>(
  actor: Actor,
  pathId: string,
  select: S,
): Promise<Prisma.LearningPathGetPayload<{ select: S }> | null> {
  if (!pathId || pathId.length > 50) return null;
  return prisma.learningPath.findFirst({
    where: { AND: [{ id: pathId }, await pathVisibleWhere(actor)] },
    select,
  }) as Promise<Prisma.LearningPathGetPayload<{ select: S }> | null>;
}

/** Lộ trình giao được: trong phạm vi xem và đã phát hành. */
export async function assignablePathsWhere(actor: Actor): Promise<Prisma.LearningPathWhereInput> {
  return { AND: [await pathVisibleWhere(actor), { status: "PUBLISHED" }] };
}

/**
 * Khoá được thêm vào lộ trình: đã phát hành, của công ty sở hữu lộ trình hoặc của công ty tổng.
 * Lộ trình của công ty tổng chỉ chọn khoá của công ty tổng (để giao được cho mọi công ty).
 */
export async function selectableCoursesWhere(path: { ownerCompanyId: string }): Promise<Prisma.CourseWhereInput> {
  const groupId = await getGroupCompanyId();
  const owners = path.ownerCompanyId === groupId || !groupId ? [path.ownerCompanyId] : [path.ownerCompanyId, groupId];
  return { status: "PUBLISHED", ownerCompanyId: { in: owners } };
}
