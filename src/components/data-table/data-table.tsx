import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { SearchParams } from "@/lib/table-params";
import { DataTableEmpty } from "./data-table-empty";
import { DataTableFilter, type FilterOption } from "./data-table-filter";
import { DataTablePageSize } from "./data-table-page-size";
import { DataTablePagination } from "./data-table-pagination";
import { DataTableRow } from "./data-table-row";
import { DataTableSearch } from "./data-table-search";

/**
 * Bảng danh sách dùng chung (docs/design-system.md mục 5.2) — SERVER component.
 * Tìm kiếm, lọc, trang, số dòng đều nằm trên URL; page.tsx đọc searchParams và truy vấn Prisma,
 * rồi truyền `rows` + `total` vào đây.
 *
 *   <DataTable
 *     pathname="/org/positions"
 *     searchParams={sp}
 *     columns={[{ key: "code", header: "Mã", cell: (p) => p.code }]}
 *     rows={positions} rowKey={(p) => p.id}
 *     total={total} page={page} pageSize={pageSize}
 *     filters={[{ param: "status", label: "Trạng thái", options: [...] }]}
 *     empty={{ title: "Chưa có chức danh nào" }}
 *   />
 */

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Lớp cho cả ô đầu bảng và ô dữ liệu (VD: "w-32 text-right") */
  className?: string;
};

export type DataTableFilterConfig = {
  param: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
};

export function DataTable<T>({
  pathname,
  searchParams,
  columns,
  rows,
  rowKey,
  total,
  page,
  pageSize,
  searchPlaceholder,
  filters = [],
  toolbar,
  empty,
  rowHref,
  extraFilters,
  extraFilterParams,
  clearHref,
}: {
  pathname: string;
  searchParams: SearchParams;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  total: number;
  page: number;
  pageSize: number;
  searchPlaceholder?: string;
  filters?: DataTableFilterConfig[];
  /** Nút bên phải thanh công cụ (VD: "+ Thêm") */
  toolbar?: ReactNode;
  empty: { title: string; description?: string; action?: ReactNode };
  /** Bấm cả dòng để mở trang / panel chi tiết (link, nút trong dòng vẫn hoạt động riêng) */
  rowHref?: (row: T) => string;
  /** Ô lọc tuỳ biến (VD: khoảng ngày) — chèn vào lưới bộ lọc, sau các ô chọn */
  extraFilters?: ReactNode;
  /** Tham số URL của extraFilters — để biết đang có lọc (hiện “Xoá bộ lọc” khi rỗng) */
  extraFilterParams?: string[];
  /** Link của nút “Xoá bộ lọc” (mặc định = pathname). VD giữ lại ?course= khi trang phụ thuộc 1 tham số cố định */
  clearHref?: string;
}) {
  const filterParams = ["q", ...filters.map((f) => f.param), ...(extraFilterParams ?? [])];
  const filtered = filterParams.some((key) => !!searchParams[key]) || page > 1;

  return (
    <div className="overflow-hidden rounded-md bg-card shadow-md">
      {(filters.length > 0 || extraFilters) && (
        <div className="p-6">
          <h2 className="mb-4 text-lg font-medium text-foreground">Bộ lọc</h2>
          <div className="grid grid-cols-3 gap-6">
            {filters.map((f) => (
              <DataTableFilter key={f.param} {...f} />
            ))}
            {extraFilters}
          </div>
        </div>
      )}

      <div className={cn("flex items-center justify-between gap-4 p-6", (filters.length > 0 || extraFilters) && "border-t border-border")}>
        <DataTablePageSize pageSize={pageSize} />
        <div className="flex items-center gap-4">
          <DataTableSearch placeholder={searchPlaceholder} />
          {toolbar}
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <table className="w-full caption-bottom">
          <thead>
            <tr className="border-y border-border">
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={cn(
                    "h-14 px-4 text-left align-middle text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase first:pl-6 last:pr-6",
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length}>
                  <DataTableEmpty {...empty} filtered={filtered} clearHref={clearHref ?? pathname} />
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const cells = columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      "h-[50px] px-4 align-middle text-[15px] whitespace-nowrap text-muted-foreground first:pl-6 last:pr-6",
                      col.className,
                    )}
                  >
                    {col.cell(row)}
                  </td>
                ));
                const rowClass = "border-b border-border transition-colors last:border-0 hover:bg-muted/50";
                return rowHref ? (
                  <DataTableRow key={rowKey(row)} href={rowHref(row)} className={rowClass}>
                    {cells}
                  </DataTableRow>
                ) : (
                  <tr key={rowKey(row)} className={rowClass}>
                    {cells}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <DataTablePagination
        pathname={pathname}
        searchParams={searchParams}
        page={page}
        pageSize={pageSize}
        total={total}
      />
    </div>
  );
}
