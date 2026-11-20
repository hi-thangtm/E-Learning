import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { buildHref, type SearchParams } from "@/lib/table-params";

/** Danh sách số trang cần hiện, rút gọn bằng "…" khi nhiều trang. */
function pageList(current: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  const start = Math.max(2, current - 1);
  const end = Math.min(totalPages - 1, current + 1);
  if (start > 2) pages.push("…");
  for (let p = start; p <= end; p++) pages.push(p);
  if (end < totalPages - 1) pages.push("…");
  pages.push(totalPages);
  return pages;
}

const itemClass =
  "flex size-[38px] items-center justify-center rounded-md text-[15px] transition-colors";

/** Phân trang theo URL: "Hiển thị X–Y trong Z kết quả" + nút trang. */
export function DataTablePagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  searchParams: SearchParams;
  page: number;
  pageSize: number;
  total: number;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : Math.min((page - 1) * pageSize + 1, total);
  const to = Math.min(page * pageSize, total);
  const href = (p: number) => buildHref(pathname, searchParams, { page: p === 1 ? null : p });

  return (
    <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
      <p className="text-[13px] text-muted-foreground">
        Hiển thị {formatNumber(from)}–{formatNumber(to)} trong {formatNumber(total)} kết quả
      </p>
      {totalPages > 1 && (
        <nav aria-label="Phân trang" className="flex items-center gap-1.5">
          {page > 1 ? (
            <Link href={href(page - 1)} className={cn(itemClass, "bg-muted hover:bg-primary/16")} aria-label="Trang trước">
              <ChevronLeft className="size-4" />
            </Link>
          ) : (
            <span className={cn(itemClass, "bg-muted opacity-45")} aria-hidden>
              <ChevronLeft className="size-4" />
            </span>
          )}
          {pageList(page, totalPages).map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className={cn(itemClass, "text-muted-foreground")}>
                …
              </span>
            ) : (
              <Link
                key={p}
                href={href(p)}
                aria-current={p === page ? "page" : undefined}
                className={cn(
                  itemClass,
                  p === page
                    ? "bg-primary text-primary-foreground shadow-primary-sm"
                    : "bg-muted text-foreground hover:bg-primary/16 hover:text-primary",
                )}
              >
                {p}
              </Link>
            ),
          )}
          {page < totalPages ? (
            <Link href={href(page + 1)} className={cn(itemClass, "bg-muted hover:bg-primary/16")} aria-label="Trang sau">
              <ChevronRight className="size-4" />
            </Link>
          ) : (
            <span className={cn(itemClass, "bg-muted opacity-45")} aria-hidden>
              <ChevronRight className="size-4" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
