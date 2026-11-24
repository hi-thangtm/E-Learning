import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { AlarmClockOff, Award, BookCheck, ChevronRight, FileDiff, Gauge, Users, UserRoundCheck } from "lucide-react";
import { AuditLogTable } from "@/components/audit/audit-log-table";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { MetricHeader } from "@/components/info-tip";
import { PageHeader } from "@/components/page-header";
import { AUDIT_LOG_SELECT, enrichAuditLogs } from "@/lib/audit-query";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatNumber, formatPercent } from "@/lib/format";
import { getAttentionCourses, getCompanyStats, getMonthlyCompletions, type AttentionCourse, type CompanyStats } from "@/lib/group-dashboard";
import { METRICS, type MetricKey } from "@/lib/report-definitions";
import { sortRows } from "@/lib/reports";
import { getParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { normalizeSearch } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { SortHeader } from "../../reports/sort-header";
import { CompanyRateChart, CompletionTrendChart } from "./overview-charts";

export const metadata: Metadata = { title: "Tổng quan tập đoàn" };

const PATHNAME = "/system/overview";
const SORT_KEYS = ["code", "memberCount", "completionRate", "overduePeopleRate", "ackRate", "activeRate"];

const TONES = {
  primary: "bg-primary/16 text-primary",
  success: "bg-success/16 text-success",
  info: "bg-info/16 text-info",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/16 text-destructive",
  secondary: "bg-secondary text-secondary-foreground",
} as const;

const pctText = (v: number | null) => (v === null ? "—" : `${formatPercent(v)}`);

/** Ngưỡng tỷ lệ hoàn thành: xanh ≥ 90, vàng 70–89, đỏ < 70. */
function rateTone(v: number | null) {
  if (v === null) return "text-foreground/45";
  return v >= 90 ? "bg-success/16 text-success" : v >= 70 ? "bg-warning/16 text-warning" : "bg-destructive/16 text-destructive";
}

/** Tổng quan tập đoàn (Việc 28B — feature-spec 6.3) — chỉ Admin tập đoàn. Định nghĩa chỉ số: docs/reports.md. */
export default async function GroupOverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const sp = await searchParams;
  const sortParam = getParam(sp, "sort");
  const sort = SORT_KEYS.includes(sortParam) ? sortParam : null;
  const dir = getParam(sp, "dir") === "asc" ? "asc" : "desc";

  const { companies, totals } = await getCompanyStats();
  const trendCompany = companies.find((c) => c.companyId === getParam(sp, "trend"))?.companyId ?? null;
  const [trend, attention, rawLogs] = await Promise.all([
    getMonthlyCompletions(trendCompany),
    getAttentionCourses(),
    prisma.auditLog.findMany({
      where: { actorId: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 10,
      select: AUDIT_LOG_SELECT,
    }),
  ]);
  const logs = await enrichAuditLogs(actor, rawLogs);
  const { q, page, pageSize, skip } = parseTableParams(sp);
  const needle = normalizeSearch(q);
  const filtered = needle ? companies.filter((c) => normalizeSearch(`${c.code} ${c.name}`).includes(needle)) : companies;
  const rows = sortRows(filtered, sort, dir);

  const columns: DataTableColumn<CompanyStats>[] = [
    {
      key: "company",
      header: <SortHeader field="code" label="Công ty" text />,
      cell: (c) => (
        <span className="block">
          <span className="font-medium text-foreground">{c.code}</span>
          {c.isGroup && <span className="ml-2 rounded-sm bg-primary/16 px-1.5 text-[12px] text-primary">Công ty tổng</span>}
          <span className="block max-w-72 truncate text-[13px] text-muted-foreground" title={c.name}>{c.name}</span>
        </span>
      ),
    },
    { key: "members", header: <SortHeader field="memberCount" metric="memberCount" />, className: "text-right", cell: (c) => <span className="tabular-nums">{formatNumber(c.memberCount)}</span> },
    {
      key: "rate",
      header: <SortHeader field="completionRate" metric="completionRate" label="Hoàn thành" />,
      className: "text-right",
      cell: (c) => (
        <span className={cn("inline-flex min-w-16 justify-end rounded-sm px-2 py-0.5 font-medium tabular-nums", rateTone(c.completionRate))}>
          {pctText(c.completionRate)}
        </span>
      ),
    },
    {
      key: "overdue",
      header: <SortHeader field="overduePeopleRate" metric="overduePeopleRate" label="Quá hạn" />,
      className: "text-right",
      cell: (c) => (
        <span className={cn("tabular-nums", c.overduePeople > 0 && "text-destructive")}>
          {pctText(c.overduePeopleRate)}
          <span className="ml-1 text-[12px] text-muted-foreground">({formatNumber(c.overduePeople)})</span>
        </span>
      ),
    },
    { key: "ack", header: <SortHeader field="ackRate" metric="groupAckRate" label="Nắm bản mới" />, className: "text-right", cell: (c) => <span className="tabular-nums">{pctText(c.ackRate)}</span> },
    {
      key: "active",
      header: <SortHeader field="activeRate" metric="activeRate" label="Hoạt động 30 ngày" />,
      className: "text-right",
      cell: (c) => (
        <span className="tabular-nums">
          {pctText(c.activeRate)}
          <span className="ml-1 text-[12px] text-muted-foreground">({formatNumber(c.activeLearners)})</span>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan tập đoàn" description="Số liệu học tập toàn tập đoàn và so sánh giữa các công ty. Rê chuột vào ⓘ để xem định nghĩa." />

      <div className="grid grid-cols-4 gap-6">
        <Stat metric="memberCount" label="Nhân viên đang làm" value={formatNumber(totals.memberCount)} icon={<Users />} tone="primary" />
        <Stat metric="publishedCourses" value={formatNumber(totals.publishedCourses)} icon={<BookCheck />} tone="info" />
        <Stat
          metric="completionRate"
          value={pctText(totals.completionRate)}
          hint={`${formatNumber(totals.completed)}/${formatNumber(totals.assigned)} lượt học`}
          icon={<Gauge />}
          tone="success"
        />
        <Stat
          metric="overduePeople"
          value={formatNumber(totals.overduePeople)}
          hint={`${pctText(totals.overduePeopleRate)} nhân viên`}
          icon={<AlarmClockOff />}
          tone={totals.overduePeople > 0 ? "destructive" : "secondary"}
          valueClass={totals.overduePeople > 0 ? "text-destructive" : undefined}
        />
        <Stat
          metric="groupAckRate"
          value={pctText(totals.ackRate)}
          hint={`${formatNumber(totals.acknowledged)}/${formatNumber(totals.everCompleted)} lượt`}
          icon={<FileDiff />}
          tone="warning"
        />
        <Stat metric="validCertificates" value={formatNumber(totals.validCertificates)} icon={<Award />} tone="warning" />
        <Stat
          metric="activeLearners"
          value={formatNumber(totals.activeLearners)}
          hint={`${pctText(totals.activeRate)} nhân viên`}
          icon={<UserRoundCheck />}
          tone="primary"
        />
      </div>

      {/* So sánh công ty */}
      <section className="space-y-2">
        <h2 className="text-lg font-medium text-foreground">So sánh các công ty</h2>
        <DataTable
          pathname={PATHNAME}
          searchParams={sp}
          columns={columns}
          rows={rows.slice(skip, skip + pageSize)}
          rowKey={(c) => c.companyId}
          rowHref={(c) => `/reports?company=${c.companyId}`}
          total={rows.length}
          page={page}
          pageSize={pageSize}
          searchPlaceholder="Tìm công ty..."
          empty={{ title: q ? "Không tìm thấy công ty" : "Chưa có công ty nào đang hoạt động" }}
        />
        <p className="text-[13px] text-muted-foreground">
          Bấm 1 dòng để mở Báo cáo của công ty đó. Màu tỷ lệ hoàn thành: <span className="text-success">xanh ≥ 90%</span>,{" "}
          <span className="text-warning">vàng 70–89%</span>, <span className="text-destructive">đỏ &lt; 70%</span>.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-6">
        <section className="rounded-md bg-card p-6 shadow-md">
          <h2 className="flex items-center gap-1 text-lg font-medium text-foreground">
            <MetricHeader metric="completionRate" label="Tỷ lệ hoàn thành theo công ty" />
          </h2>
          <p className="mb-4 text-[13px] text-muted-foreground">Khoá được giao (bỏ tự đăng ký)</p>
          <CompanyRateChart data={companies.map((c) => ({ code: c.code, name: c.name, rate: c.completionRate }))} />
        </section>
        <section className="rounded-md bg-card p-6 shadow-md">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-foreground">Lượt hoàn thành khoá theo tháng</h2>
              <p className="text-[13px] text-muted-foreground">12 tháng gần nhất (giờ Việt Nam)</p>
            </div>
            <DataTableFilter
              param="trend"
              label="Công ty"
              allLabel="Toàn tập đoàn"
              options={companies.map((c) => ({ value: c.companyId, label: `${c.code} — ${c.name}` }))}
              className="w-56"
            />
          </div>
          <CompletionTrendChart data={trend.map((t) => ({ label: t.label, completions: t.completions }))} />
        </section>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <AttentionList
          title="Tỷ lệ quá hạn cao nhất"
          hint="Khoá có ≥ 5 lượt học"
          rows={attention.overdue}
          tone="text-destructive"
          detail={(c) => `${c.part}/${c.whole} lượt quá hạn`}
          href={(c) => `/reports?course=${c.courseId}`}
          empty="Không có khoá nào đang quá hạn đáng kể."
        />
        <AttentionList
          title="Tỷ lệ nắm phiên bản mới thấp nhất"
          hint="Khoá có phiên bản ≥ 2"
          rows={attention.ack}
          tone="text-warning"
          detail={(c) => `${c.part}/${c.whole} lượt đã nắm`}
          href={(c) => `/reports?tab=versions&course=${c.courseId}`}
          empty="Chưa có khoá nào có bản cập nhật cần nắm."
        />
      </div>

      <section className="rounded-md bg-card p-6 shadow-md">
        <header className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">Hoạt động gần đây</h2>
            <p className="text-[13px] text-muted-foreground">10 thao tác quản trị mới nhất</p>
          </div>
          <Link href="/system/audit-logs" className="inline-flex items-center gap-1 text-[15px] text-primary hover:underline">
            Xem tất cả <ChevronRight className="size-4" />
          </Link>
        </header>
        {logs.length === 0 ? (
          <p className="text-[15px] text-muted-foreground">Chưa có thao tác nào.</p>
        ) : (
          <AuditLogTable rows={logs} showCompany rowHref={(log) => `/system/audit-logs?log=${log.id}`} />
        )}
      </section>
    </div>
  );
}

function Stat({
  metric,
  label,
  value,
  hint,
  icon,
  tone,
  valueClass,
}: {
  metric: MetricKey;
  label?: string;
  value: string;
  hint?: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
  valueClass?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-md bg-card p-6 shadow-md">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[15px] text-foreground">
          <MetricHeader metric={metric} label={label ?? METRICS[metric].label} />
        </p>
        <p className={cn("text-2xl font-medium text-foreground tabular-nums", valueClass)}>{value}</p>
        {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <span className={cn("flex size-[42px] shrink-0 items-center justify-center rounded-md [&_svg]:size-[26px]", TONES[tone])}>{icon}</span>
    </div>
  );
}

function AttentionList({
  title,
  hint,
  rows,
  tone,
  detail,
  href,
  empty,
}: {
  title: string;
  hint: string;
  rows: AttentionCourse[];
  tone: string;
  detail: (c: AttentionCourse) => string;
  href: (c: AttentionCourse) => string;
  empty: string;
}) {
  return (
    <section className="rounded-md bg-card shadow-md">
      <header className="p-6 pb-4">
        <h2 className="text-lg font-medium text-foreground">Khoá cần chú ý · {title}</h2>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </header>
      {rows.length === 0 ? (
        <p className="px-6 pb-6 text-[15px] text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y divide-border border-t border-border">
          {rows.map((c) => (
            <li key={c.courseId}>
              <Link href={href(c)} className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-muted/50">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground" title={c.title}>
                    {c.title}
                  </span>
                  <span className="text-[13px] text-muted-foreground">{c.code}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn("block font-medium tabular-nums", tone)}>{pctText(c.value)}</span>
                  <span className="text-[13px] text-muted-foreground">{detail(c)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
