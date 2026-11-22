import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlarmClockOff, ChevronRight, FileDiff, Gauge, Users } from "lucide-react";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { getTeamScope } from "@/lib/scope";
import { getParam, type SearchParams } from "@/lib/table-params";
import { getCourseProgress, getTeamOverview, type MemberRow } from "@/lib/team-stats";
import { cn } from "@/lib/utils";
import { EmptyTeam } from "./empty-team";
import { CourseProgressChart, DepartmentRateChart } from "./team-charts";

export const metadata: Metadata = { title: "Tổng quan đội" };

const TONES = {
  primary: "bg-primary/16 text-primary",
  success: "bg-success/16 text-success",
  destructive: "bg-destructive/16 text-destructive",
  warning: "bg-warning/16 text-warning",
  secondary: "bg-secondary text-secondary-foreground",
} as const;

/** Tổng quan đội (Việc 26 — feature-spec 3.1): MANAGER (phòng mình + phòng con), Admin công ty (cả công ty), Admin tập đoàn. */
export default async function TeamOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const sp = await searchParams;
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const companies = isGroupAdmin
    ? await prisma.company.findMany({
        where: { isActive: true },
        orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
        select: { id: true, code: true, name: true },
      })
    : [];
  const companyId = isGroupAdmin ? (companies.find((c) => c.id === getParam(sp, "company"))?.id ?? null) : null;
  const scope = await getTeamScope(actor, { companyId });

  const description =
    actor.role === "MANAGER"
      ? "Tiến độ học của các phòng bạn làm trưởng (gồm phòng con)."
      : actor.role === "COMPANY_ADMIN"
        ? `Tiến độ học của nhân viên ${actor.company.name}.`
        : "Tiến độ học của nhân viên toàn tập đoàn hoặc theo công ty.";
  const header = (
    <PageHeader
      title="Tổng quan đội"
      description={description}
      actions={
        isGroupAdmin && (
          <DataTableFilter
            param="company"
            label="Công ty"
            allLabel="Toàn tập đoàn"
            options={companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
            className="w-64"
          />
        )
      }
    />
  );

  if (scope.empty) {
    return (
      <>
        {header}
        <EmptyTeam />
      </>
    );
  }

  const memberIds = (await prisma.user.findMany({ where: scope.where, select: { id: true } })).map((u) => u.id);
  const [overview, courses] = await Promise.all([getTeamOverview(scope), getCourseProgress(memberIds, 10)]);
  const membersHref = (extra: string) => `/team/members${companyId ? `?company=${companyId}${extra ? `&${extra}` : ""}` : extra ? `?${extra}` : ""}`;

  return (
    <div className="space-y-6">
      {header}

      <div className="grid grid-cols-4 gap-6">
        <StatCard href={membersHref("")} label="Số nhân viên" value={formatNumber(overview.memberCount)} hint="Đang làm việc trong phạm vi" icon={<Users />} tone="primary" />
        <StatCard
          href={membersHref("sort=rate&dir=asc")}
          label="Tỷ lệ hoàn thành"
          value={overview.rate === null ? "—" : `${overview.rate}%`}
          hint={`${formatNumber(overview.completed)}/${formatNumber(overview.assigned)} lượt khoá được giao`}
          icon={<Gauge />}
          tone="success"
        />
        <StatCard
          href={membersHref("overdue=1")}
          label="Người đang quá hạn"
          value={formatNumber(overview.overduePeople)}
          hint={overview.overduePeople > 0 ? "Cần nhắc nhở" : "Không ai quá hạn"}
          icon={<AlarmClockOff />}
          tone={overview.overduePeople > 0 ? "destructive" : "secondary"}
          valueClass={overview.overduePeople > 0 ? "text-destructive" : undefined}
        />
        <StatCard
          href={membersHref("unack=1")}
          label="Chưa nắm quy trình mới"
          value={formatNumber(overview.unacknowledgedPeople)}
          hint="Có bản cập nhật chưa xác nhận"
          icon={<FileDiff />}
          tone={overview.unacknowledgedPeople > 0 ? "warning" : "secondary"}
          valueClass={overview.unacknowledgedPeople > 0 ? "text-warning" : undefined}
        />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <section className="col-span-7 rounded-md bg-card p-6 shadow-md">
          <h2 className="text-lg font-medium text-foreground">Tiến độ theo khoá</h2>
          <p className="mb-4 text-[13px] text-muted-foreground">10 khoá được giao cho nhiều người nhất</p>
          {courses.length === 0 ? (
            <p className="py-16 text-center text-[15px] text-muted-foreground">Chưa có khoá nào được giao cho đội.</p>
          ) : (
            <CourseProgressChart data={courses.map((c) => ({ code: c.code, title: c.title, completed: c.completed, inProgress: c.inProgress, notStarted: c.notStarted, overdue: c.overdue }))} />
          )}
        </section>
        <section className="col-span-5 rounded-md bg-card p-6 shadow-md">
          <h2 className="text-lg font-medium text-foreground">Tỷ lệ hoàn thành theo phòng ban</h2>
          <p className="mb-4 text-[13px] text-muted-foreground">Đã xong ÷ khoá được giao</p>
          {overview.departments.length === 0 ? (
            <p className="py-16 text-center text-[15px] text-muted-foreground">Chưa có số liệu.</p>
          ) : (
            <DepartmentRateChart data={overview.departments.map((d) => ({ name: d.name, rate: d.rate, completed: d.completed, assigned: d.assigned }))} />
          )}
        </section>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <AttentionList
          title="Quá hạn nhiều nhất"
          empty="Không có ai đang quá hạn."
          rows={overview.topOverdue}
          moreHref={membersHref("overdue=1&sort=overdue&dir=desc")}
          detail={(r) => (
            <span className="text-right">
              <span className="block font-medium text-destructive">{r.overdue} khoá quá hạn</span>
              <span className="text-[13px] text-muted-foreground">lâu nhất {r.maxOverdueDays} ngày</span>
            </span>
          )}
        />
        <AttentionList
          title="Chưa nắm quy trình mới"
          empty="Mọi người đã nắm phiên bản mới nhất."
          rows={overview.topUnacknowledged}
          moreHref={membersHref("unack=1&sort=unacknowledged&dir=desc")}
          detail={(r) => <span className="font-medium text-warning">{r.unacknowledged} khoá chưa xác nhận</span>}
        />
      </div>
    </div>
  );
}

function StatCard({
  href,
  label,
  value,
  hint,
  icon,
  tone,
  valueClass,
}: {
  href: string;
  label: string;
  value: string;
  hint: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
  valueClass?: string;
}) {
  return (
    <Link href={href} className="flex items-start justify-between gap-2 rounded-md bg-card p-6 shadow-md transition-shadow hover:shadow-lg">
      <div className="flex flex-col gap-1">
        <p className="text-[15px] text-foreground">{label}</p>
        <p className={cn("text-2xl font-medium text-foreground tabular-nums", valueClass)}>{value}</p>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <span className={cn("flex size-[42px] shrink-0 items-center justify-center rounded-md [&_svg]:size-[26px]", TONES[tone])}>{icon}</span>
    </Link>
  );
}

function AttentionList({
  title,
  empty,
  rows,
  moreHref,
  detail,
}: {
  title: string;
  empty: string;
  rows: MemberRow[];
  moreHref: string;
  detail: (r: MemberRow) => ReactNode;
}) {
  return (
    <section className="rounded-md bg-card shadow-md">
      <header className="flex items-center justify-between p-6 pb-4">
        <div>
          <h2 className="text-lg font-medium text-foreground">Cần chú ý · {title}</h2>
          <p className="text-[13px] text-muted-foreground">Tối đa 10 người</p>
        </div>
        {rows.length > 0 && (
          <Link href={moreHref} className="inline-flex items-center gap-1 text-[15px] text-primary hover:underline">
            Xem tất cả <ChevronRight className="size-4" />
          </Link>
        )}
      </header>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-[15px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/team/members/${r.id}`} className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">{r.fullName}</span>
                  <span className="text-[13px] text-muted-foreground">
                    {r.employeeCode} · {r.departmentName ?? "Chưa có phòng ban"}
                  </span>
                </span>
                {detail(r)}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
