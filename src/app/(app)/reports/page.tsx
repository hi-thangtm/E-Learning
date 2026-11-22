import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileSpreadsheet } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { filtersToParams, parseReportFilters, REPORT_TAB_LABELS, REPORT_TABS, resolveReportContext } from "@/lib/reports";
import { parseTableParams, type SearchParams } from "@/lib/table-params";
import { flattenTree } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { EmptyTeam } from "../team/empty-team";
import { loadTab, parseTabState } from "./data";
import { CumulativeToggle, ReportFilters } from "./report-filters";
import { ReportTable } from "./report-tables";

export const metadata: Metadata = { title: "Báo cáo" };

const PATHNAME = "/reports";

/** Báo cáo (Việc 27 — feature-spec 3.2, 5.5, 6.3). Phạm vi: getTeamScope. Định nghĩa chỉ số: docs/reports.md. */
export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const sp = await searchParams;
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const state = parseTabState(sp);
  const { page, pageSize } = parseTableParams(sp);

  const ctx = await resolveReportContext(actor, parseReportFilters(sp));
  const description =
    actor.role === "MANAGER"
      ? "Số liệu học tập của các phòng bạn làm trưởng (gồm phòng con)."
      : actor.role === "COMPANY_ADMIN"
        ? `Số liệu học tập của nhân viên ${actor.company.name}.`
        : "Số liệu học tập toàn tập đoàn hoặc theo công ty.";

  if (ctx.scope.empty) {
    return (
      <>
        <PageHeader title="Báo cáo" description={description} />
        <EmptyTeam />
      </>
    );
  }

  const [data, companies, categories] = await Promise.all([
    loadTab(ctx, state),
    isGroupAdmin
      ? prisma.company.findMany({ where: { isActive: true }, orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }], select: { id: true, code: true, name: true } })
      : Promise.resolve(null),
    prisma.courseCategory.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, isActive: true } }),
  ]);

  const filterParams = filtersToParams(ctx.filters);
  const exportParams = (tab: string) => {
    const p = new URLSearchParams({ ...filterParams, tab });
    if (tab === state.tab) {
      if (state.course) p.set("course", state.course);
      if (state.q) p.set("q", state.q);
      if (state.sort) p.set("sort", state.sort);
      if (state.sort) p.set("dir", state.dir);
      if (state.cumulative) p.set("cumulative", "1");
      if (state.window !== "30") p.set("window", state.window);
    }
    return `${PATHNAME}/export?${p.toString()}`;
  };
  const tabHref = (tab: string) => `${PATHNAME}?${new URLSearchParams({ ...filterParams, ...(tab !== "courses" && { tab }) }).toString()}`;
  const departmentOptions = flattenTree(ctx.departments, "all").map(({ row, depth }) => ({
    value: row.id,
    label: `${"   ".repeat(depth)}${row.name}${isGroupAdmin && !ctx.filters.companyId && depth === 0 ? ` (${row.companyCode})` : ""}${row.isActive ? "" : " (đã ẩn)"}`,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Báo cáo"
        description={description}
        actions={
          <>
            <a href={exportParams("all")} className={buttonVariants({ variant: "outline" })} download>
              <FileSpreadsheet />
              Xuất toàn bộ
            </a>
          </>
        }
      />

      <ReportFilters
        companies={companies?.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })) ?? null}
        departments={departmentOptions}
        categories={categories.map((c) => ({ value: c.id, label: c.isActive ? c.name : `${c.name} (đã ẩn)` }))}
        from={ctx.filters.from ?? ""}
        to={ctx.filters.to ?? ""}
        includeSub={ctx.filters.includeSub}
        includeSelf={ctx.filters.includeSelf}
        hasDepartment={!!ctx.filters.departmentId}
      />

      <nav aria-label="Loại báo cáo" className="flex gap-1 overflow-x-auto rounded-md bg-card px-4 shadow-md">
        {REPORT_TABS.map((t) => (
          <Link
            key={t}
            href={tabHref(t)}
            scroll={false}
            aria-current={t === state.tab ? "page" : undefined}
            className={cn(
              "-mb-px flex shrink-0 items-center border-b-2 px-4 py-3 text-[15px] transition-colors",
              t === state.tab ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {REPORT_TAB_LABELS[t]}
          </Link>
        ))}
      </nav>

      <ReportTable
        data={data}
        sp={sp}
        page={page}
        pageSize={pageSize}
        filterParams={filterParams}
        isGroupAdmin={isGroupAdmin}
        toolbar={
          <div className="flex items-center gap-4">
            {state.tab === "departments" && !state.course && (
              <CumulativeToggle checked={state.cumulative} />
            )}
            <a href={exportParams(state.tab)} className={buttonVariants({ variant: "outline" })} download>
              <Download />
              Xuất Excel
            </a>
          </div>
        }
      />
    </div>
  );
}
