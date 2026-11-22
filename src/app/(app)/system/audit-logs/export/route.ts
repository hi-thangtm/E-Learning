import { formatAuditValue, fieldLabel } from "@/lib/audit";
import { AUDIT_LOG_SELECT, buildAuditWhere, enrichAuditLogs, type AuditLogRow } from "@/lib/audit-query";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { addSimpleSheet, createWorkbook, workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { getSetting } from "@/lib/settings";
import { formatDateTimeSeconds, formatNumber } from "@/lib/format";
import type { SearchParams } from "@/lib/table-params";

/**
 * Xuất nhật ký ra Excel theo bộ lọc hiện tại: GET /system/audit-logs/export?from=&to=&q=&group=&entity=&company=
 * Cùng phạm vi với trang (Admin công ty chỉ công ty mình). Tối đa 10.000 dòng mới nhất.
 */
const MAX_EXPORT_ROWS = 10_000;

export async function GET(request: Request) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const url = new URL(request.url);
  const sp: SearchParams = Object.fromEntries(url.searchParams.entries());
  const { where, filters } = buildAuditWhere(actor, sp);

  const [total, logs] = await prisma.$transaction([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: MAX_EXPORT_ROWS,
      select: AUDIT_LOG_SELECT,
    }),
  ]);
  const rows = await enrichAuditLogs(actor, logs);

  const wb = createWorkbook(await getSetting("SYSTEM_NAME"));
  const ws = addSimpleSheet<AuditLogRow>(
    wb,
    "Nhật ký",
    [
      { header: "Thời gian", width: 20, value: (r) => formatDateTimeSeconds(r.createdAt) },
      { header: "Người thực hiện", width: 26, value: (r) => r.actor?.fullName ?? "Hệ thống" },
      { header: "Mã NV", width: 14, value: (r) => r.actor?.employeeCode ?? "" },
      { header: "Công ty", width: 12, value: (r) => r.company?.code ?? "" },
      { header: "Thao tác", width: 28, value: (r) => r.label },
      { header: "Mô tả", width: 40, value: (r) => r.summary ?? "" },
      { header: "Loại đối tượng", width: 16, value: (r) => r.entityTypeLabel },
      { header: "Đối tượng", width: 32, value: (r) => r.entity?.label ?? "" },
      { header: "Chi tiết", width: 70, value: (r) => describeMetadata(r.metadata) },
      { header: "Mã thao tác", width: 26, value: (r) => r.action },
    ],
    rows,
  );
  ws.getColumn(9).alignment = { wrapText: true, vertical: "top" };

  ws.addRow([]);
  const note = ws.addRow([
    `Từ ${filters.from.split("-").reverse().join("/")} đến ${filters.to.split("-").reverse().join("/")} · ${
      total > MAX_EXPORT_ROWS
        ? `chỉ xuất ${formatNumber(MAX_EXPORT_ROWS)} dòng mới nhất trong ${formatNumber(total)} dòng — hãy thu hẹp bộ lọc để xuất đủ`
        : `${formatNumber(total)} dòng`
    }.`,
  ]);
  note.font = { italic: true };

  const stamp = new Date().toISOString().slice(0, 10);
  return xlsxResponse(await workbookToBuffer(wb), `nhat-ky-thao-tac-${stamp}.xlsx`);
}

/** Metadata -> chữ dễ đọc trong 1 ô Excel (mỗi khoá 1 dòng). */
function describeMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "";
  return Object.entries(metadata as Record<string, unknown>)
    .map(([key, value]) => `${fieldLabel(key)}: ${formatAuditValue(key, value)}`)
    .join("\n");
}
