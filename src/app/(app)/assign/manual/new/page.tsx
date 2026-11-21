import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { assignableCoursesWhere, learnerCompaniesForCourse } from "@/lib/assignment-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getNumberSetting } from "@/lib/settings";
import { getParam, type SearchParams } from "@/lib/table-params";
import { AssignWizard } from "./assign-wizard";
import type { WizardCourse } from "./types";

export const metadata: Metadata = { title: "Giao khoá học" };

export default async function AssignNewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const sp = await searchParams;

  const [courses, companies, departments, positions, defaultDays] = await Promise.all([
    prisma.course.findMany({
      where: await assignableCoursesWhere(actor),
      orderBy: [{ title: "asc" }],
      select: { id: true, code: true, title: true, ownerCompanyId: true, ownerCompany: { select: { code: true } } },
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
    getNumberSetting("DEFAULT_DUE_DAYS", 30),
  ]);

  const wizardCourses: WizardCourse[] = await Promise.all(
    courses.map(async (c) => ({
      id: c.id,
      code: c.code,
      title: c.title,
      ownerCode: c.ownerCompany.code,
      learnerCompanies: await learnerCompaniesForCourse(actor, c),
    })),
  );
  const preselected = wizardCourses.find((c) => c.id === getParam(sp, "courseId"))?.id ?? null;

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link href="/assign/manual" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-4" />
          Danh sách giao khoá
        </Link>
        <h1 className="text-2xl font-medium text-foreground">Giao khoá học</h1>
        <p className="text-[15px] text-muted-foreground">
          Chọn khoá đã phát hành, chọn người học và đặt hạn. Người đã có lượt giao chỉ được rút ngắn hạn, người đã học xong được bỏ qua.
        </p>
      </div>
      <AssignWizard
        courses={wizardCourses}
        initialCourseId={preselected}
        companies={companies.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        departments={departments}
        positions={positions.map((p) => ({ id: p.id, label: p.name }))}
        defaultDays={defaultDays}
      />
    </>
  );
}
