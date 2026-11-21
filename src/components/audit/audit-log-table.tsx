import { DataTableRow } from "@/components/data-table/data-table-row";
import type { AuditLogRow } from "@/lib/audit-query";
import { cn } from "@/lib/utils";
import { auditLogColumns } from "./audit-columns";

/**
 * Bảng nhật ký gọn (không lọc / phân trang) — cùng cột với trang Nhật ký.
 * Dùng ở trang chi tiết người dùng (“20 thao tác gần nhất”). Bấm dòng mở panel chi tiết qua `rowHref`.
 */
export function AuditLogTable({
  rows,
  rowHref,
  showCompany,
}: {
  rows: AuditLogRow[];
  rowHref: (row: AuditLogRow) => string;
  showCompany: boolean;
}) {
  const columns = auditLogColumns({ showCompany });

  return (
    <div className="relative -mx-6 w-[calc(100%+3rem)] overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-y border-border">
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(
                  "h-12 px-4 text-left align-middle text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase first:pl-6 last:pr-6",
                  col.className,
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <DataTableRow
              key={row.id}
              href={rowHref(row)}
              className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "h-[50px] px-4 py-2 align-middle text-[15px] whitespace-nowrap text-muted-foreground first:pl-6 last:pr-6",
                    col.className,
                  )}
                >
                  {col.cell(row)}
                </td>
              ))}
            </DataTableRow>
          ))}
        </tbody>
      </table>
    </div>
  );
}
