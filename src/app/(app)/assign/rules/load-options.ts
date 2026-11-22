import { assignableCoursesWhere } from "@/lib/assignment-scope";
import { getGroupCompanyId } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { assignablePathsWhere } from "@/lib/path-scope";
import { getSetting } from "@/lib/settings";
import type { RuleFormOptions, RuleSubjectOption } from "./types";

type SubjectRow = { id: string; code: string; title: string; ownerCompanyId: string; status: string; ownerCompany: { code: string } };
const toOption = (c: SubjectRow): RuleSubjectOption => ({
  id: c.id,
  code: c.code,
  title: c.title,
  ownerCompanyId: c.ownerCompanyId,
  ownerCode: c.ownerCompany.code,
  published: c.status === "PUBLISHED",
});

/**
 * Danh sách lựa chọn cho form quy tắc (server). `include` = khoá / lộ trình của quy tắc đang sửa
 * (kể cả không còn phát hành).
 */
export async function loadRuleFormOptions(
  actor: CurrentUser,
  include?: { courseId?: string | null; pathId?: string | null },
): Promise<RuleFormOptions> {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const select = { id: true, code: true, title: true, ownerCompanyId: true, status: true, ownerCompany: { select: { code: true } } } as const;
  const [courses, paths, companies, departments, positions, defaultDays, groupCompanyId] = await Promise.all([
    prisma.course.findMany({
      where: { OR: [await assignableCoursesWhere(actor), ...(include?.courseId ? [{ id: include.courseId }] : [])] },
      orderBy: { title: "asc" },
      select,
    }),
    prisma.learningPath.findMany({
      where: { OR: [await assignablePathsWhere(actor), ...(include?.pathId ? [{ id: include.pathId }] : [])] },
      orderBy: { title: "asc" },
      select,
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
    getSetting("DEFAULT_DUE_DAYS"),
    getGroupCompanyId(),
  ]);

  return {
    isGroupAdmin,
    actorCompanyId: actor.companyId,
    groupCompanyId: groupCompanyId ?? "",
    defaultDays,
    courses: courses.map(toOption),
    paths: paths.map(toOption),
    companies,
    departments,
    positions,
  };
}
