"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CircleAlert, TriangleAlert } from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  QUESTION_COLUMN_KEYS,
  QUESTION_COLUMN_LABELS,
  type QuestionImportStatus,
  type QuestionPreviewRow,
} from "./types";

const PAGE_SIZE = 50;

const STATUS: Record<QuestionImportStatus, { label: string; tone: StatusTone }> = {
  valid: { label: "Hợp lệ", tone: "success" },
  warning: { label: "Cảnh báo", tone: "warning" },
  error: { label: "Lỗi", tone: "destructive" },
};

type Filter = "all" | "error" | "warning";

/** Bảng xem trước từng dòng: ô lỗi tô đỏ (rê chuột xem lý do), dòng cảnh báo có ghi chú vàng. Phân trang 50 dòng. */
export function QuestionImportPreviewTable({ rows }: { rows: QuestionPreviewRow[] }) {
  const errorCount = rows.filter((r) => r.status === "error").length;
  const warningCount = rows.filter((r) => r.status === "warning").length;
  const [filter, setFilter] = useState<Filter>(errorCount > 0 ? "error" : "all");
  const [page, setPage] = useState(1);

  const visible = useMemo(() => (filter === "all" ? rows : rows.filter((r) => r.status === filter)), [rows, filter]);
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const tabs: [Filter, string][] = [
    ["all", `Tất cả (${formatNumber(rows.length)})`],
    ["error", `Lỗi (${formatNumber(errorCount)})`],
    ["warning", `Cảnh báo (${formatNumber(warningCount)})`],
  ];

  return (
    <>
      <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
        <div role="radiogroup" aria-label="Lọc dòng" className="inline-flex rounded-lg bg-muted p-1">
          {tabs.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={filter === value}
              onClick={() => {
                setFilter(value);
                setPage(1);
              }}
              className={cn(
                "h-[30px] rounded-md px-3.5 text-[13px] font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                filter === value ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
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
              {QUESTION_COLUMN_KEYS.map((key) => (
                <th
                  key={key}
                  scope="col"
                  className="h-14 px-4 text-left text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase last:pr-6"
                >
                  {QUESTION_COLUMN_LABELS[key]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={QUESTION_COLUMN_KEYS.length + 2} className="py-12 text-center text-[15px] text-muted-foreground">
                  Không có dòng nào.
                </td>
              </tr>
            ) : (
              pageRows.map((row) => (
                <tr key={row.rowNumber} className="border-b border-border last:border-0 hover:bg-muted/50">
                  <td className="h-[50px] pr-4 pl-6 align-top text-[15px] text-muted-foreground">
                    <span className="inline-block pt-3">{row.rowNumber}</span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <StatusBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</StatusBadge>
                    {row.warning && (
                      <p className="mt-1.5 flex w-48 items-start gap-1 text-[13px] whitespace-normal text-warning">
                        <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
                        {row.warning}
                      </p>
                    )}
                  </td>
                  {QUESTION_COLUMN_KEYS.map((key) => {
                    const error = row.errors[key];
                    return (
                      <td
                        key={key}
                        title={error ? `${error}` : row.values[key] || undefined}
                        className={cn(
                          "h-[50px] max-w-56 px-4 align-top text-[15px] whitespace-nowrap last:pr-6",
                          error ? "bg-destructive/16 text-destructive" : "text-muted-foreground",
                        )}
                      >
                        <span className="flex items-center gap-1.5 pt-3">
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
            <Button variant="outline" size="icon-sm" disabled={current <= 1} onClick={() => setPage(current - 1)} aria-label="Trang trước">
              <ChevronLeft />
            </Button>
            <span className="text-[13px] text-muted-foreground">
              Trang {current}/{pageCount}
            </span>
            <Button variant="outline" size="icon-sm" disabled={current >= pageCount} onClick={() => setPage(current + 1)} aria-label="Trang sau">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
