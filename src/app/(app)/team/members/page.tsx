import type { Metadata } from "next";
import Link from "next/link";
import { Download, SearchX, Users } from "lucide-react";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { buildHref, parseTableParams, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { EmptyTeam } from "../empty-team";
import { MembersTable } from "./members-table";
import { loadMembers, parseMemberQuery } from "./query";

export const metadata: Metadata = { title: "Nhân viên" };

const PATHNAME = "/team/members";

/** Nhân viên trong phạm vi đội (Việc 26): số liệu khoá được giao, lọc / sắp xếp / nhắc nhở / xuất Excel. */
export default async function TeamMembersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const sp = await searchParams;
  const query = parseMemberQuery(sp);
  const { page, pageSize, skip } = parseTableParams(sp);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const [{ scope, rows, departmentOptions }, companies] = await Promise.all([
    loadMembers(actor, query),
    isGroupAdmin
      ? prisma.company.findMany({ where: { isActive: true }, orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }], select: { id: true, code: true, name: true } })
      : Promise.resolve([]),
  ]);

  const description =
    actor.role === "MANAGER"
      ? "Nhân viên các phòng bạn làm trưởng (gồm phòng con). Khoá được giao không tính khoá tự đăng ký."
      : actor.role === "COMPANY_ADMIN"
        ? `Nhân viên ${actor.company.name}. Khoá được giao không tính khoá tự đăng ký.`
        : "Nhân viên toàn tập đoàn hoặc theo công ty. Khoá được giao không tính khoá tự đăng ký.";

  if (scope.empty) {
    return (
      <>
        <PageHeader title="Nhân viên" description={description} />
        <EmptyTeam />
      </>
    );
  }

  const pageRows = rows.slice(skip, skip + pageSize).map((r) => ({
    id: r.id,
    fullName: r.fullName,
    employeeCode: r.employeeCode,
    avatarUrl: r.avatarUrl,
    departmentName: r.departmentName,
    positionName: r.positionName,
    assigned: r.assigned,
    completed: r.completed,
    inProgress: r.inProgress,
    overdue: r.overdue,
    unacknowledged: r.unacknowledged,
    rate: r.rate,
  }));
  const filtered = !!query.q || !!query.department || query.overdue || query.unack;
  const exportQuery = new URLSearchParams(
    Object.entries({ q: query.q, company: query.company, department: query.department, overdue: query.overdue ? "1" : "", unack: query.unack ? "1" : "", sort: query.sort, dir: query.dir }).filter(
      ([, v]) => v,
    ),
  ).toString();
  const toggle = (key: "overdue" | "unack", on: boolean) =>
    cn(
      "inline-flex h-[38px] items-center rounded-md border px-3 text-[13px] whitespace-nowrap transition-colors",
      on ? "border-primary bg-primary/8 text-primary" : "border-border text-muted-foreground hover:border-primary hover:text-primary",
    );

  return (
    <>
      <PageHeader
        title="Nhân viên"
        description={description}
        actions={
          <a href={`${PATHNAME}/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonVariants({ variant: "outline" })} download>
            <Download />
            Xuất Excel
          </a>
        }
      />

      <section className="rounded-md bg-card shadow-md">
        <div className="flex flex-wrap items-center gap-4 p-6">
          <div className="w-72">
            <DataTableSearch placeholder="Tìm theo tên, mã NV..." />
          </div>
          {isGroupAdmin && (
            <DataTableFilter
              param="company"
              label="Công ty"
              allLabel="Toàn tập đoàn"
              options={companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
              className="w-56"
            />
          )}
          {departmentOptions.length > 0 && (
            <DataTableFilter param="department" label="Phòng ban" allLabel="Mọi phòng ban" options={departmentOptions} className="w-56" />
          )}
          <Link href={buildHref(PATHNAME, sp, { overdue: query.overdue ? null : "1", page: null })} scroll={false} aria-pressed={query.overdue} className={toggle("overdue", query.overdue)}>
            Chỉ người có quá hạn
          </Link>
          <Link href={buildHref(PATHNAME, sp, { unack: query.unack ? null : "1", page: null })} scroll={false} aria-pressed={query.unack} className={toggle("unack", query.unack)}>
            Chỉ người chưa nắm cập nhật
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 border-t border-border py-14 text-center">
            <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
              {filtered ? <SearchX className="size-8" /> : <Users className="size-8" />}
            </div>
            <p className="text-lg font-medium text-foreground">{filtered ? "Không có nhân viên phù hợp" : "Chưa có nhân viên nào trong phạm vi"}</p>
            {filtered && (
              <Link href={buildHref(PATHNAME, sp, { q: null, department: null, overdue: null, unack: null, page: null })} className="text-[15px] text-primary hover:underline">
                Xoá tìm kiếm và bộ lọc
              </Link>
            )}
          </div>
        ) : (
          <>
            <MembersTable key={`${exportQuery}|${page}`} rows={pageRows} total={rows.length} />
            <DataTablePagination pathname={PATHNAME} searchParams={sp} page={page} pageSize={pageSize} total={rows.length} />
          </>
        )}
      </section>
    </>
  );
}
