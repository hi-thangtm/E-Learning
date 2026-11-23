"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { IMPORT_COLUMN_LABELS, type ImportColumnKey, type ImportPreviewRow, type ImportRowStatus } from "./types";
import { Tooltip } from "@/components/ui/tooltip";

const PAGE_SIZE = 50;
const COLUMNS = Object.keys(IMPORT_COLUMN_LABELS) as ImportColumnKey[];

const STATUS: Record<ImportRowStatus, { label: string; tone: StatusTone }> = {
  create: { label: "Tạo mới", tone: "success" },
  update: { label: "Cập nhật", tone: "info" },
  unchanged: { label: "Không đổi", tone: "secondary" },
  error: { label: "Lỗi", tone: "destructive" },
};

/** Bảng xem trước từng dòng: ô lỗi tô đỏ, rê chuột xem lý do. Lọc “Chỉ dòng lỗi”, phân trang 50 dòng. */
export function ImportPreviewTable({ rows }: { rows: ImportPreviewRow[] }) {
  const errorCount = rows.filter((r) => r.status === "error").length;
  const [onlyErrors, setOnlyErrors] = useState(errorCount > 0);
  const [page, setPage] = useState(1);

  const visible = useMemo(() => (onlyErrors ? rows.filter((r) => r.status === "error") : rows), [rows, onlyErrors]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
        <div role="radiogroup" aria-label="Lọc dòng" className="inline-flex rounded-lg bg-muted p-1">
          {(
            [
              [false, `Tất cả (${formatNumber(rows.length)})`],
              [true, `Chỉ dòng lỗi (${formatNumber(errorCount)})`],
            ] as const
          ).map(([value, label]) => (
            <button
              key={String(value)}
              type="button"
              role="radio"
              aria-checked={onlyErrors === value}
              onClick={() => {
                setOnlyErrors(value);
                setPage(1);
              }}
              className={cn(
                "h-[30px] rounded-md px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                onlyErrors === value ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[13px] text-muted-foreground">Rê chuột vào ô tô đỏ để xem lý do lỗi.</p>
      </div>

      <div className="relative w-full overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-y border-border">
              <th scope="col" className="h-14 w-16 pr-4 pl-6 text-left text-[13px] font-medium text-foreground uppercase">
                Dòng
              </th>
              <th scope="col" className="h-14 w-28 px-4 text-left text-[13px] font-medium text-foreground uppercase">
                Kết quả
              </th>
              {COLUMNS.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="h-14 px-4 text-left text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase last:pr-6"
                >
                  {IMPORT_COLUMN_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 2} className="py-12 text-center text-[15px] text-muted-foreground">
                  Không có dòng lỗi nào.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="h-[50px] pr-4 pl-6 text-[15px] text-muted-foreground">{row.rowNumber}</td>
                  <td className="px-4">
                    <StatusBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusBadge>
                  </td>
                  {COLUMNS.map((key) => {
                    const error = row.errors[key];
                    return (
                      <td
                        key={key}
                        title={error}
                        className={cn(
                          "h-[50px] max-w-56 px-4 text-[15px] whitespace-nowrap last:pr-6",
                          error ? "bg-destructive/16 text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <span className="flex items-center gap-1.5">
                          {error && <CircleAlert className="size-4 shrink-0" aria-hidden />}
                          <span className="truncate">{row.values[key] || (error ? "(trống)" : "—")}</span>
                          {error && <span className="sr-only">Lỗi: {error}</span>}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between gap-4 px-6 py-4">
          <p className="text-[13px] text-muted-foreground">
            Hiển thị {formatNumber((current - 1) * PAGE_SIZE + 1)}–{formatNumber(Math.min(current * PAGE_SIZE, visible.length))}{" "}
            trong {formatNumber(visible.length)} dòng
          </p>
          <div className="flex items-center gap-2">
            <Tooltip label="Trang trước"><Button variant="outline" size="icon-sm" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Trang trước">
              <ChevronLeft />
            </Button></Tooltip>
            <span className="text-[13px] text-muted-foreground">
              Trang {current}/{pageCount}
            </span>
            <Tooltip label="Trang sau"><Button variant="outline" size="icon-sm" disabled={current >= pageCount} onClick={() => setPage(current + 1)} aria-label="Trang sau">
              <ChevronRight />
            </Button></Tooltip>
          </div>
        </div>
      )}
    </>
  );
}
