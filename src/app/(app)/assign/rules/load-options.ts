import { assignableCoursesWhere } from "@/lib/assignment-scope";
import { getGroupCompanyId } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getNumberSetting } from "@/lib/settings";
import type { RuleFormOptions } from "./types";

/** Danh sách lựa chọn cho form quy tắc (server). `includeCourseId` = khoá của quy tắc đang sửa (kể cả không còn phát hành). */
export async function loadRuleFormOptions(actor: CurrentUser, includeCourseId?: string | null): Promise<RuleFormOptions> {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const [courses, companies, departments, positions, defaultDays, groupCompanyId] = await Promise.all([
    prisma.course.findMany({
      where: { OR: [await assignableCoursesWhere(actor), ...(includeCourseId ? [{ id: includeCourseId }] : [])] },
      orderBy: { title: "asc" },
      select: { id: true, code: true, title: true, ownerCompanyId: true, status: true, ownerCompany: { select: { code: true } } },
    }),
    prisma.company.findMany({
      where: isGroupAdmin ? {} : { id: actor.companyId },
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.department.findMany({
      where: isGroupAdmin ? {} : { companyId: actor.companyId },
      orderBy: { code: "asc" },
      select: { id: true, companyId: true, parentId: true, name: true, isActive: true },
    }),
    prisma.position.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, isActive: true } }),
    getNumberSetting("DEFAULT_DUE_DAYS", 30),
    getGroupCompanyId(),
  ]);

  return {
    isGroupAdmin,
    actorCompanyId: actor.companyId,
    groupCompanyId: groupCompanyId ?? "",
    defaultDays,
    courses: courses.map((c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      ownerCompanyId: c.ownerCompanyId,
      ownerCode: c.ownerCompany.code,
      published: c.status === "PUBLISHED",
    })),
    companies,
    departments,
    positions,
  };
}
