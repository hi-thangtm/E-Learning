"use server";

import type { Prisma } from "@prisma/client";
import { courseVisibleWhere } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { menuForRole } from "@/lib/roles";
import { getTeamScope } from "@/lib/scope";
import { normalizeSearch } from "@/lib/tree";

/**
 * Tìm nhanh (Ctrl/⌘ + K — Việc 28B). Học viên không dùng. Luôn theo phạm vi của người tìm:
 * - Nhân viên: MANAGER = người trong đội (getTeamScope) → /team/members/[id]; COMPANY_ADMIN = công ty mình, GROUP_ADMIN = mọi người
 *   (như trang Người dùng, gồm cả tài khoản đã khoá) → /org/users/[id]. CONTENT_EDITOR không tìm nhân viên.
 * - Khoá học: CONTENT_EDITOR / COMPANY_ADMIN / GROUP_ADMIN theo phạm vi xem khoá (courseVisibleWhere) → /content/courses/[id].
 * - Trang: mục menu được phép của vai trò (src/lib/roles.ts).
 */

const LIMIT = 8;
const ROLES = ["MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"] as const;

export type QuickSearchItem = { id: string; title: string; subtitle: string; href: string };
export type QuickSearchResult = { people: QuickSearchItem[]; courses: QuickSearchItem[]; pages: QuickSearchItem[]; rateLimited?: boolean };

const EMPTY: QuickSearchResult = { people: [], courses: [], pages: [] };

export async function searchEverything(query: string): Promise<QuickSearchResult> {
  const actor = await requireRole([...ROLES]);
  const q = String(query ?? "").trim().slice(0, 100);
  if (q.length < 2) return EMPTY;
  // 60 lần / phút / người
  if (!rateLimit(`search:${actor.id}`, LIMITS.quickSearch).ok) return { ...EMPTY, rateLimited: true };

  const textMatch = (fields: ("fullName" | "employeeCode" | "email")[]): Prisma.UserWhereInput => ({
    OR: fields.map((f) => ({ [f]: { contains: q, mode: "insensitive" as const } })),
  });

  // --- Nhân viên ---
  let peopleScope: Prisma.UserWhereInput | null = null;
  let peopleHref = (id: string) => `/org/users/${id}`;
  if (actor.role === "MANAGER") {
    const scope = await getTeamScope(actor);
    peopleScope = scope.empty ? null : scope.where;
    peopleHref = (id) => `/team/members/${id}`;
  } else if (actor.role === "COMPANY_ADMIN") {
    peopleScope = { companyId: actor.companyId };
  } else if (actor.role === "GROUP_ADMIN") {
    peopleScope = {};
  }

  const canCourses = actor.role !== "MANAGER";
  const [people, courses] = await Promise.all([
    peopleScope
      ? prisma.user.findMany({
          where: { AND: [peopleScope, textMatch(["fullName", "employeeCode", "email"])] },
          orderBy: [{ status: "asc" }, { fullName: "asc" }],
          take: LIMIT,
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            status: true,
            company: { select: { code: true } },
            department: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    canCourses
      ? prisma.course.findMany({
          where: {
            AND: [
              await courseVisibleWhere(actor),
              { OR: [{ code: { contains: q, mode: "insensitive" } }, { title: { contains: q, mode: "insensitive" } }] },
            ],
          },
          orderBy: [{ updatedAt: "desc" }],
          take: LIMIT,
          select: { id: true, code: true, title: true, status: true, ownerCompany: { select: { code: true } } },
        })
      : Promise.resolve([]),
  ]);

  const STATUS = { DRAFT: "Nháp", PUBLISHED: "Đã phát hành", ARCHIVED: "Lưu trữ" } as const;
  const needle = normalizeSearch(q);
  const pages = menuForRole(actor.role)
    .flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))
    .filter((i) => normalizeSearch(i.label).includes(needle) || normalizeSearch(i.group).includes(needle))
    .slice(0, LIMIT);

  return {
    people: people.map((u) => ({
      id: u.id,
      title: u.fullName,
      subtitle: [u.employeeCode, actor.role === "GROUP_ADMIN" ? u.company.code : null, u.department?.name, u.status !== "ACTIVE" ? "Đã khoá" : null]
        .filter(Boolean)
        .join(" · "),
      href: peopleHref(u.id),
    })),
    courses: courses.map((c) => ({
      id: c.id,
      title: c.title,
      subtitle: [c.code, STATUS[c.status], `Công ty ${c.ownerCompany.code}`].join(" · "),
      href: `/content/courses/${c.id}`,
    })),
    pages: pages.map((p) => ({ id: p.href, title: p.label, subtitle: p.group, href: p.href })),
  };
}
