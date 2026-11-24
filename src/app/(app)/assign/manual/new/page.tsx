import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { assignableCoursesWhere, learnerCompaniesForCourse } from "@/lib/assignment-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { assignablePathsWhere } from "@/lib/path-scope";
import { getSetting } from "@/lib/settings";
import { getParam, type SearchParams } from "@/lib/table-params";
import { AssignWizard } from "./assign-wizard";
import type { WizardCourse } from "./types";

export const metadata: Metadata = { title: "Giao khoá học / lộ trình" };

export default async function AssignNewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const sp = await searchParams;

  const [courses, paths, companies, departments, positions, defaultDays] = await Promise.all([
    prisma.course.findMany({
      where: await assignableCoursesWhere(actor),
      orderBy: [{ title: "asc" }],
      select: { id: true, code: true, title: true, ownerCompanyId: true, ownerCompany: { select: { code: true } } },
    }),
    prisma.learningPath.findMany({
      where: await assignablePathsWhere(actor),
      orderBy: [{ title: "asc" }],
      select: {
        id: true,
        code: true,
        title: true,
        ownerCompanyId: true,
        ownerCompany: { select: { code: true } },
        _count: { select: { courses: true } },
      },
    }),
    prisma.company.findMany({
      where: { isActive: true, ...(isGroupAdmin ? {} : { id: actor.companyId }) },
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    prisma.department.findMany({
      where: { isActive: true, ...(isGroupAdmin ? {} : { companyId: actor.companyId }) },
      orderBy: { code: "asc" },
      select: { id: true, companyId: true, parentId: true, name: true },
    }),
    prisma.position.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSetting("DEFAULT_DUE_DAYS"),
  ]);

  const wizardCourses: WizardCourse[] = await Promise.all(
    courses.map(async (c) => ({
      kind: "course" as const,
      courseCount: 1,
      id: c.id,
      code: c.code,
      title: c.title,
      ownerCode: c.ownerCompany.code,
      learnerCompanies: await learnerCompaniesForCourse(actor, c),
    })),
  );
  const wizardPaths: WizardCourse[] = await Promise.all(
    paths.map(async (p) => ({
      kind: "path" as const,
      courseCount: p._count.courses,
      id: p.id,
      code: p.code,
      title: p.title,
      ownerCode: p.ownerCompany.code,
      learnerCompanies: await learnerCompaniesForCourse(actor, p),
    })),
  );
  const preselectedPath = wizardPaths.find((p) => p.id === getParam(sp, "pathId"))?.id ?? null;
  const preselected = preselectedPath
    ? { kind: "path" as const, id: preselectedPath }
    : (() => {
        const id = wizardCourses.find((c) => c.id === getParam(sp, "courseId"))?.id;
        return id ? { kind: "course" as const, id } : null;
      })();

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link href="/assign/manual" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-4" />
          Giao khoá học
        </Link>
        <h1 className="text-2xl font-medium text-foreground">Giao khoá học / lộ trình</h1>
        <p className="text-[15px] text-muted-foreground">
          Chọn khoá học hoặc lộ trình đã phát hành, chọn học viên và đặt hạn. Người đã có lượt giao chỉ được rút ngắn hạn, người đã học xong được bỏ qua.
        </p>
      </div>
      <AssignWizard
        courses={wizardCourses}
        paths={wizardPaths}
        initial={preselected}
        companies={companies.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        departments={departments}
        positions={positions.map((p) => ({ id: p.id, label: p.name }))}
        defaultDays={defaultDays}
      />
    </>
  );
}
