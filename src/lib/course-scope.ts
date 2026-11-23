import "server-only";
import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Phạm vi khoá học (docs/database.md — Quy tắc 1):
 * - GROUP_ADMIN: thấy và sửa mọi khoá học.
 * - COMPANY_ADMIN / CONTENT_EDITOR: thấy + sửa khoá của công ty mình (ownerCompanyId);
 *   XEM được khoá của công ty tổng đã phát hành (PUBLISHED), không sửa.
 * Luôn lọc ngay trong câu truy vấn, không tin id gửi từ trình duyệt.
 */

let groupCompanyIdCache: string | null = null;

/** Id công ty tổng (parentId = NULL). Không đổi trong suốt vòng đời app -> nhớ lại sau lần đầu. */
export async function getGroupCompanyId(): Promise<string | null> {
  if (groupCompanyIdCache) return groupCompanyIdCache;
  const group = await prisma.company.findFirst({ where: { parentId: null }, select: { id: true } });
  groupCompanyIdCache = group?.id ?? null;
  return groupCompanyIdCache;
}

export async function courseVisibleWhere(actor: Pick<CurrentUser, "role" | "companyId">): Promise<Prisma.CourseWhereInput> {
  if (actor.role === "GROUP_ADMIN") return {};
  const groupId = await getGroupCompanyId();
  return {
    OR: [
      { ownerCompanyId: actor.companyId },
      ...(groupId && groupId !== actor.companyId ? [{ ownerCompanyId: groupId, status: "PUBLISHED" as const }] : []),
    ],
  };
}

/** Được sửa khoá học này không (Admin tập đoàn: mọi khoá; người khác: khoá của công ty mình). */
export function canEditCourse(actor: CurrentUser, course: { ownerCompanyId: string }): boolean {
  return actor.role === "GROUP_ADMIN" || course.ownerCompanyId === actor.companyId;
}

/** Tìm khoá học trong phạm vi xem của người dùng (null = không có hoặc ngoài phạm vi). */
export async function findCourseInScope<S extends Prisma.CourseSelect>(
  actor: CurrentUser,
  courseId: string,
  select: S,
): Promise<Prisma.CourseGetPayload<{ select: S }> | null> {
  if (!courseId || courseId.length > 50) return null;
  const where = await courseVisibleWhere(actor);
  return prisma.course.findFirst({
    where: { AND: [{ id: courseId }, where] },
    select,
  }) as Promise<Prisma.CourseGetPayload<{ select: S }> | null>;
}

export const COURSE_STATUS_LABELS = {
  DRAFT: "Nháp",
  PUBLISHED: "Đã phát hành",
  ARCHIVED: "Lưu trữ",
} as const;
