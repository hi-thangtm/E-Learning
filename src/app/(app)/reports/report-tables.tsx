import Link from "next/link";
import { ChevronLeft, Star } from "lucide-react";
import type { ReactNode } from "react";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { ProgressBar } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/enrollment-labels";
import { formatDate, formatDateTime, formatDecimal, formatNumber, formatPercent } from "@/lib/format";
import { CERT_WINDOWS, type CertWindow, type LearnerRow } from "@/lib/reports";
import { buildHref, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { AckReminderButton } from "./ack-reminder-button";
import type { TabData } from "./data";
import { SortHeader } from "./sort-header";

/** Bảng của từng tab báo cáo (server). Dữ liệu đã lọc / sắp xếp ở data.ts; ở đây chỉ cắt trang + hiển thị. */

const PATHNAME = "/reports";

const num = (v: number) => <span className="tabular-nums">{formatNumber(v)}</span>;
const dash = <span className="text-foreground/45">—</span>;
const one = (v: number | null) => (v === null ? dash : <span className="tabular-nums">{formatDecimal(v)}</span>);
const rate = (v: number | null) =>
  v === null ? (
    dash
  ) : (
    <div className="flex items-center gap-2">
      <ProgressBar value={v} className="w-16" />
      <span className="text-[13px] tabular-nums">{formatPercent(v)}</span>
    </div>
  );
const pctText = (v: number | null) => (v === null ? dash : <span className="tabular-nums">{formatPercent(v)}</span>);

type Common = { sp: SearchParams; page: number; pageSize: number; toolbar: ReactNode; filterParams: Record<string, string>; isGroupAdmin: boolean };

export function ReportTable({ data, ...c }: { data: TabData } & Common) {
  const slice = <T,>(rows: T[]) => rows.slice((c.page - 1) * c.pageSize, c.page * c.pageSize);
  const tableProps = { pathname: PATHNAME, searchParams: c.sp, page: c.page, pageSize: c.pageSize, toolbar: c.toolbar };
  const back = (label: string) => (
    <Link href={buildHref(PATHNAME, c.sp, { course: null, q: null, sort: null, dir: null, page: null })} className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
      <ChevronLeft className="size-4" />
      {label}
    </Link>
  );

  switch (data.kind) {
    case "courses": {
      type R = (typeof data.rows)[number];
      const columns: DataTableColumn<R>[] = [
        {
          key: "title",
          header: <SortHeader field="title" label="Khoá học" text />,
          cell: (r) => (
            <span className="block max-w-72">
              <span className="block truncate font-medium text-foreground" title={r.title}>
                {r.title}
              </span>
              <span className="text-[13px] text-muted-foreground">
                {r.code}
                {r.categoryName ? ` · ${r.categoryName}` : ""}
              </span>
            </span>
          ),
        },
        { key: "assigned", header: <SortHeader field="assigned" metric="assigned" />, className: "text-right", cell: (r) => num(r.assigned) },
        { key: "inProgress", header: <SortHeader field="inProgress" metric="inProgress" />, className: "text-right", cell: (r) => num(r.inProgress) },
        { key: "notStarted", header: <SortHeader field="notStarted" metric="notStarted" />, className: "text-right", cell: (r) => num(r.notStarted) },
        { key: "completed", header: <SortHeader field="completed" metric="completed" />, className: "text-right", cell: (r) => num(r.completed) },
        {
          key: "overdue",
          header: <SortHeader field="overdue" metric="overdue" />,
          className: "text-right",
          cell: (r) => <span className={cn("tabular-nums", r.overdue > 0 && "font-medium text-destructive")}>{formatNumber(r.overdue)}</span>,
        },
        { key: "completionRate", header: <SortHeader field="completionRate" metric="completionRate" label="Tỷ lệ" />, cell: (r) => rate(r.completionRate) },
        { key: "avgScore", header: <SortHeader field="avgScore" metric="avgScore" />, className: "text-right", cell: (r) => one(r.avgScore) },
        { key: "firstPassRate", header: <SortHeader field="firstPassRate" metric="firstPassRate" />, className: "text-right", cell: (r) => pctText(r.firstPassRate) },
        { key: "avgDays", header: <SortHeader field="avgDaysToComplete" metric="avgDaysToComplete" label="Ngày HT TB" />, className: "text-right", cell: (r) => one(r.avgDaysToComplete) },
        {
          key: "rating",
          header: <SortHeader field="avgRating" metric="avgRating" />,
          className: "text-right",
          cell: (r) =>
            r.avgRating === null ? (
              dash
            ) : (
              <span className="inline-flex items-center gap-1 whitespace-nowrap tabular-nums">
                <Star className="size-3.5 fill-warning text-warning" />
                {formatDecimal(r.avgRating, 1, true)}
                <span className="text-muted-foreground">· {r.ratingCount}</span>
              </span>
            ),
        },
      ];
      return (
        <DataTable
          {...tableProps}
          columns={columns}
          rows={slice(data.rows)}
          rowKey={(r) => r.courseId}
          rowHref={(r) => buildHref(PATHNAME, c.sp, { course: r.courseId, q: null, sort: null, dir: null, page: null })}
          total={data.rows.length}
          searchPlaceholder="Tìm khoá học..."
          empty={{ title: "Chưa có lượt học nào khớp bộ lọc", description: "Thử bỏ bớt bộ lọc hoặc bật “Gồm khoá tự đăng ký”." }}
        />
      );
    }

    case "courseLearners":
    case "versionLearners": {
      const isVersion = data.kind === "versionLearners";
      const unconfirmed = data.rows.filter((r) => r.ackState === "unconfirmed").length;
      const columns: DataTableColumn<LearnerRow>[] = [
        {
          key: "name",
          header: <SortHeader field="fullName" label="Nhân viên" text />,
          cell: (r) => (
            <Link href={`/team/members/${r.userId}`} className="block max-w-64 hover:text-primary" title={r.fullName}>
              <span className="block truncate font-medium text-foreground">{r.fullName}</span>
              <span className="text-[13px] text-muted-foreground">{r.employeeCode}</span>
            </Link>
          ),
        },
        { key: "dept", header: <SortHeader field="departmentName" label="Phòng ban" text />, cell: (r) => r.departmentName ?? dash },
        {
          key: "status",
          header: "Trạng thái",
          cell: (r) =>
            isVersion ? (
              r.ackState === "unconfirmed" ? (
                <StatusBadge tone="warning">Chưa xác nhận (MINOR)</StatusBadge>
              ) : (
                <StatusBadge tone="info">Đang học lại (MAJOR)</StatusBadge>
              )
            ) : r.overdue ? (
              <StatusBadge tone="destructive">Quá hạn</StatusBadge>
            ) : (
              <StatusBadge tone={ENROLLMENT_STATUS_LABELS[r.status].tone}>{ENROLLMENT_STATUS_LABELS[r.status].label}</StatusBadge>
            ),
        },
        ...(isVersion
          ? [{ key: "ack", header: "Phiên bản đã nắm", cell: (r: LearnerRow) => (r.acknowledgedVersion ? `v${r.acknowledgedVersion} / v${data.course.currentVersion}` : dash) }]
          : []),
        { key: "progress", header: <SortHeader field="progressPercent" label="Tiến độ" />, cell: (r) => rate(r.progressPercent) },
        {
          key: "due",
          header: <SortHeader field="dueDate" label="Hạn" />,
          cell: (r) => <span className={cn("whitespace-nowrap", r.overdue && "text-destructive")}>{r.dueDate ? formatDate(r.dueDate) : "—"}</span>,
        },
        ...(isVersion
          ? []
          : [
              { key: "best", header: <SortHeader field="bestScore" metric="bestScore" />, className: "text-right", cell: (r: LearnerRow) => one(r.bestScore) },
              { key: "done", header: <SortHeader field="completedAt" label="Ngày xong" />, cell: (r: LearnerRow) => (r.completedAt ? formatDate(r.completedAt) : dash) },
            ]),
      ];
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1">
              {back(isVersion ? "Nắm quy trình mới nhất" : "Theo khoá học")}
              <h2 className="text-xl font-medium text-foreground">
                {data.course.title} <span className="text-[15px] font-normal text-muted-foreground">· {data.course.code}</span>
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {isVersion ? `Người chưa nắm phiên bản v${data.course.currentVersion} (trong phạm vi + bộ lọc).` : "Mọi người được giao khoá này (trong phạm vi + bộ lọc)."}
              </p>
            </div>
            {isVersion && <AckReminderButton courseId={data.course.id} courseTitle={data.course.title} filterParams={c.filterParams} count={unconfirmed} />}
          </div>
          <DataTable
            {...tableProps}
            columns={columns}
            rows={slice(data.rows)}
            rowKey={(r) => r.userId}
            total={data.rows.length}
            searchPlaceholder="Tìm người..."
            empty={{ title: isVersion ? "Mọi người đã nắm phiên bản mới nhất" : "Không có người nào khớp bộ lọc" }}
          />
        </div>
      );
    }

    case "departments": {
      type R = (typeof data.rows)[number];
      const sorted = !!c.sp.sort;
      const columns: DataTableColumn<R>[] = [
        {
          key: "name",
          header: <SortHeader field="name" label="Phòng ban" text />,
          cell: (r) => (
            <span className="flex items-center gap-2" style={{ paddingLeft: sorted ? 0 : r.depth * 20 }}>
              <span className={cn("font-medium", r.departmentId ? "text-foreground" : "text-muted-foreground italic")}>{r.name}</span>
              {c.isGroupAdmin && r.companyCode && r.depth === 0 && <span className="text-[12px] text-muted-foreground">{r.companyCode}</span>}
            </span>
          ),
        },
        { key: "members", header: <SortHeader field="memberCount" metric="memberCount" />, className: "text-right", cell: (r) => num(r.memberCount) },
        { key: "assigned", header: <SortHeader field="assigned" metric="assigned" />, className: "text-right", cell: (r) => num(r.assigned) },
        { key: "completed", header: <SortHeader field="completed" metric="completed" />, className: "text-right", cell: (r) => num(r.completed) },
        {
          key: "overdue",
          header: <SortHeader field="overdue" metric="overdue" />,
          className: "text-right",
          cell: (r) => <span className={cn("tabular-nums", r.overdue > 0 && "font-medium text-destructive")}>{formatNumber(r.overdue)}</span>,
        },
        { key: "rate", header: <SortHeader field="completionRate" metric="completionRate" />, cell: (r) => rate(r.completionRate) },
      ];
      return (
        <DataTable
          {...tableProps}
          columns={columns}
          rows={slice(data.rows)}
          rowKey={(r) => r.departmentId || "none"}
          rowHref={(r) =>
            r.departmentId
              ? `${PATHNAME}?${new URLSearchParams({ ...c.filterParams, tab: "members", department: r.departmentId, ...(c.sp.cumulative === "1" ? {} : { sub: "0" }) }).toString()}`
              : `${PATHNAME}?${new URLSearchParams({ ...c.filterParams, tab: "members" }).toString()}`
          }
          total={data.rows.length}
          searchPlaceholder="Tìm phòng ban..."
          empty={{ title: "Chưa có phòng ban nào trong phạm vi" }}
        />
      );
    }

    case "members": {
      type R = (typeof data.rows)[number];
      const columns: DataTableColumn<R>[] = [
        {
          key: "name",
          header: <SortHeader field="fullName" label="Nhân viên" text />,
          cell: (r) => (
            <span className="block">
              <span className="block font-medium text-foreground">{r.fullName}</span>
              <span className="text-[13px] text-muted-foreground">{r.employeeCode}</span>
            </span>
          ),
        },
        ...(c.isGroupAdmin ? [{ key: "company", header: <SortHeader field="companyCode" label="Công ty" text />, cell: (r: R) => r.companyCode }] : []),
        { key: "dept", header: <SortHeader field="departmentName" label="Phòng ban" text />, cell: (r) => r.departmentName ?? dash },
        { key: "pos", header: "Chức danh", cell: (r) => r.positionName ?? dash },
        { key: "assigned", header: <SortHeader field="assigned" metric="assigned" />, className: "text-right", cell: (r) => num(r.assigned) },
        { key: "completed", header: <SortHeader field="completed" metric="completed" label="Xong" />, className: "text-right", cell: (r) => num(r.completed) },
        {
          key: "overdue",
          header: <SortHeader field="overdue" metric="overdue" />,
          className: "text-right",
          cell: (r) => <span className={cn("tabular-nums", r.overdue > 0 && "font-medium text-destructive")}>{formatNumber(r.overdue)}</span>,
        },
        { key: "avgScore", header: <SortHeader field="avgScore" metric="avgScore" />, className: "text-right", cell: (r) => one(r.avgScore) },
        { key: "certs", header: <SortHeader field="validCertificates" metric="validCertificates" label="CN còn hạn" />, className: "text-right", cell: (r) => num(r.validCertificates) },
        {
          key: "last",
          header: <SortHeader field="lastActivity" metric="lastActivity" />,
          cell: (r) => (r.lastActivity ? <span className="whitespace-nowrap">{formatDateTime(r.lastActivity)}</span> : dash),
        },
      ];
      return (
        <DataTable
          {...tableProps}
          columns={columns}
          rows={slice(data.rows)}
          rowKey={(r) => r.id}
          rowHref={(r) => `/team/members/${r.id}`}
          total={data.rows.length}
          searchPlaceholder="Tìm theo tên, mã NV..."
          empty={{ title: "Không có nhân viên nào khớp bộ lọc" }}
        />
      );
    }

    case "versions": {
      type R = (typeof data.rows)[number];
      const columns: DataTableColumn<R>[] = [
        {
          key: "title",
          header: <SortHeader field="title" label="Khoá học" text />,
          cell: (r) => (
            <span className="block max-w-72">
              <span className="block truncate font-medium text-foreground" title={r.title}>
                {r.title}
              </span>
              <span className="text-[13px] text-muted-foreground">{r.code}</span>
            </span>
          ),
        },
        { key: "ver", header: <SortHeader field="currentVersion" metric="currentVersion" label="Bản hiện tại" />, cell: (r) => `v${r.currentVersion}` },
        {
          key: "latest",
          header: <SortHeader field="latestPublishedAt" metric="latestRelease" />,
          cell: (r) => (
            <span className="flex items-center gap-2 whitespace-nowrap">
              {r.latestPublishedAt ? formatDate(r.latestPublishedAt) : "—"}
              {r.latestChangeType && <StatusBadge tone={r.latestChangeType === "MAJOR" ? "warning" : "info"}>{r.latestChangeType}</StatusBadge>}
            </span>
          ),
        },
        { key: "ever", header: <SortHeader field="everCompleted" metric="everCompleted" />, className: "text-right", cell: (r) => num(r.everCompleted) },
        { key: "ack", header: <SortHeader field="acknowledged" metric="acknowledged" />, className: "text-right", cell: (r) => num(r.acknowledged) },
        {
          key: "unconfirmed",
          header: <SortHeader field="unconfirmed" metric="unconfirmed" />,
          className: "text-right",
          cell: (r) => <span className={cn("tabular-nums", r.unconfirmed > 0 && "font-medium text-warning")}>{formatNumber(r.unconfirmed)}</span>,
        },
        { key: "relearning", header: <SortHeader field="relearning" metric="relearning" />, className: "text-right", cell: (r) => num(r.relearning) },
        { key: "rate", header: <SortHeader field="ackRate" metric="ackRate" />, cell: (r) => rate(r.ackRate) },
      ];
      return (
        <DataTable
          {...tableProps}
          columns={columns}
          rows={slice(data.rows)}
          rowKey={(r) => r.courseId}
          rowHref={(r) => buildHref(PATHNAME, c.sp, { course: r.courseId, q: null, sort: null, dir: null, page: null })}
          total={data.rows.length}
          searchPlaceholder="Tìm khoá học..."
          empty={{ title: "Chưa có khoá nào có bản cập nhật", description: "Chỉ hiện khoá đã phát hành từ phiên bản 2 trở lên và có người từng học xong." }}
        />
      );
    }

    case "certificates": {
      type R = (typeof data.rows)[number];
      const window = (CERT_WINDOWS as readonly string[]).includes(String(c.sp.window)) ? (c.sp.window as CertWindow) : "30";
      const columns: DataTableColumn<R>[] = [
        {
          key: "name",
          header: <SortHeader field="fullName" label="Nhân viên" text />,
          cell: (r) => (
            <Link href={`/team/members/${r.userId}`} className="block max-w-64 hover:text-primary" title={r.fullName}>
              <span className="block truncate font-medium text-foreground">{r.fullName}</span>
              <span className="text-[13px] text-muted-foreground">{r.employeeCode}</span>
            </Link>
          ),
        },
        { key: "dept", header: <SortHeader field="departmentName" label="Phòng ban" text />, cell: (r) => r.departmentName ?? dash },
        {
          key: "course",
          header: <SortHeader field="courseTitle" label="Khoá học" text />,
          cell: (r) => (
            <span className="block max-w-64 truncate" title={r.courseTitle}>
              {r.courseTitle}
            </span>
          ),
        },
        { key: "code", header: "Mã chứng nhận", cell: (r) => <span className="text-[13px]">{r.code}</span> },
        { key: "issued", header: <SortHeader field="issuedAt" label="Ngày cấp" />, cell: (r) => formatDate(r.issuedAt) },
        { key: "expires", header: <SortHeader field="expiresAt" metric="certExpiresAt" />, cell: (r) => formatDate(r.expiresAt) },
        {
          key: "left",
          header: <SortHeader field="daysLeft" metric="daysLeft" />,
          className: "text-right",
          cell: (r) => (
            <span className={cn("tabular-nums", r.daysLeft < 0 ? "text-destructive" : r.daysLeft <= 30 ? "text-warning" : "")}>
              {r.daysLeft < 0 ? `Hết ${-r.daysLeft} ngày` : `${r.daysLeft} ngày`}
            </span>
          ),
        },
        {
          key: "relearn",
          header: <SortHeader field="relearnStatus" metric="relearnStatus" text />,
          cell: (r) =>
            r.relearnStatus ? (
              <StatusBadge tone={ENROLLMENT_STATUS_LABELS[r.relearnStatus].tone}>{ENROLLMENT_STATUS_LABELS[r.relearnStatus].label}</StatusBadge>
            ) : (
              <span className="text-[13px] text-muted-foreground">Chưa giao lại</span>
            ),
        },
      ];
      const WINDOW_LABELS: Record<CertWindow, string> = { "30": "30 ngày", "60": "60 ngày", "90": "90 ngày", expired: "Đã hết hạn chưa học lại" };
      return (
        <div className="space-y-4">
          <nav aria-label="Khoảng thời gian" className="flex flex-wrap gap-2">
            {CERT_WINDOWS.map((w) => (
              <Link
                key={w}
                href={buildHref(PATHNAME, c.sp, { window: w === "30" ? null : w, page: null })}
                scroll={false}
                aria-current={w === window ? "page" : undefined}
                className={cn(
                  "inline-flex h-8 items-center rounded-full px-3 text-[13px] whitespace-nowrap transition-colors",
                  w === window ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/16 hover:text-primary",
                )}
              >
                {w === "expired" ? WINDOW_LABELS[w] : `Hết hạn trong ${WINDOW_LABELS[w]}`}
              </Link>
            ))}
          </nav>
          <DataTable
            {...tableProps}
            columns={columns}
            rows={slice(data.rows)}
            rowKey={(r) => r.certificateId}
            total={data.rows.length}
            searchPlaceholder="Tìm người, khoá, mã..."
            empty={{
              title: window === "expired" ? "Không có chứng nhận hết hạn chưa học lại" : `Không có chứng nhận hết hạn trong ${WINDOW_LABELS[window]}`,
            }}
          />
        </div>
      );
    }
  }
}
