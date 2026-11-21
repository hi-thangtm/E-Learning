import Link from "next/link";
import type { DataTableColumn } from "@/components/data-table/data-table";
import type { AuditLogRow } from "@/lib/audit-query";
import { formatDateTimeSeconds } from "@/lib/format";
import { AuditActionBadge } from "./audit-action-badge";

/**
 * Cột bảng nhật ký — dùng chung cho trang Nhật ký (/system/audit-logs) và trang chi tiết người dùng.
 * - showCompany: hiện cột Công ty (Admin tập đoàn)
 * - showActor: hiện cột Người thực hiện
 */
export function auditLogColumns({
  showCompany,
  showActor = true,
}: {
  showCompany: boolean;
  showActor?: boolean;
}): DataTableColumn<AuditLogRow>[] {
  const columns: DataTableColumn<AuditLogRow>[] = [
    {
      key: "time",
      header: "Thời gian",
      className: "w-44",
      cell: (log) => (
        <time dateTime={log.createdAt.toISOString()} className="tabular-nums">
          {formatDateTimeSeconds(log.createdAt)}
        </time>
      ),
    },
  ];

  if (showActor) {
    columns.push({
      key: "actor",
      header: "Người thực hiện",
      cell: (log) =>
        log.actor ? (
          <div className="min-w-0">
            <p className="truncate text-foreground">{log.actor.fullName}</p>
            <p className="text-[13px]">{log.actor.employeeCode}</p>
          </div>
        ) : (
          <span className="text-foreground/45 italic">Hệ thống</span>
        ),
    });
  }

  if (showCompany) {
    columns.push({
      key: "company",
      header: "Công ty",
      className: "w-24",
      cell: (log) =>
        log.company ? <span title={log.company.name}>{log.company.code}</span> : <span className="text-foreground/45">—</span>,
    });
  }

  columns.push(
    {
      key: "action",
      header: "Thao tác",
      cell: (log) => (
        <div className="flex flex-col items-start gap-1">
          <AuditActionBadge label={log.label} group={log.group} />
          {log.summary && (
            <span className="max-w-72 truncate text-[13px]" title={log.summary}>
              {log.summary}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "entity",
      header: "Đối tượng",
      className: "max-w-72",
      cell: (log) => (
        <div className="min-w-0">
          <p className="text-[13px]">{log.entityTypeLabel}</p>
          {log.entity ? (
            log.entity.href ? (
              <Link href={log.entity.href} className="block truncate text-foreground hover:text-primary hover:underline">
                {log.entity.label}
              </Link>
            ) : (
              <p className="truncate text-foreground">{log.entity.label}</p>
            )
          ) : (
            <p className="text-foreground/45">—</p>
          )}
        </div>
      ),
    },
  );

  return columns;
}
