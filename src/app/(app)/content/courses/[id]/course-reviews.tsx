import Link from "next/link";
import { Download, MessageSquareText, Star } from "lucide-react";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { StarRating } from "@/components/star-rating";
import { buttonVariants } from "@/components/ui/button";
import type { CurrentUser } from "@/lib/current-user";
import { formatDate, formatNumber } from "@/lib/format";
import { formatRating, getCourseRatingSummary, isEdited, listCourseReviews, parseReviewFilters, REVIEWS_PAGE_SIZE } from "@/lib/reviews";
import { buildHref, getParam, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";

/** Tab “Đánh giá” của trang soạn khoá (Việc 25): tổng quan sao + danh sách nhận xét (lọc, phân trang, xuất Excel). */
export async function CourseReviews({ actor, courseId, searchParams: sp }: { actor: CurrentUser; courseId: string; searchParams: SearchParams }) {
  const pathname = `/content/courses/${courseId}`;
  const filters = parseReviewFilters(sp);
  const page = Math.max(1, Math.floor(Number(getParam(sp, "page")) || 1));
  const [summary, list] = await Promise.all([getCourseRatingSummary(courseId), listCourseReviews(actor, courseId, { ...filters, page })]);
  if (!list) return null;

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center gap-1 rounded-full px-3 text-[13px] whitespace-nowrap transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/16 hover:text-primary",
    );
  const exportQuery = new URLSearchParams({
    ...(filters.stars && { stars: String(filters.stars) }),
    ...(filters.withComment && { comment: "1" }),
  }).toString();

  if (summary.total === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-warning/16 text-warning">
          <Star className="size-8" />
        </div>
        <p className="text-lg font-medium text-foreground">Chưa có đánh giá nào</p>
        <p className="max-w-sm text-[15px] text-muted-foreground">Học viên đánh giá khoá (1–5 sao + nhận xét) sau khi học xong.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* Tổng quan */}
      <div className="grid grid-cols-12 items-center gap-6 rounded-md border border-border p-6">
        <div className="col-span-4 flex flex-col items-center gap-2 border-r border-border text-center">
          <p className="text-5xl font-medium text-foreground tabular-nums">{formatRating(summary.average)}</p>
          <StarRating value={summary.average} size="lg" />
          <p className="text-[13px] text-muted-foreground">{formatNumber(summary.total)} lượt đánh giá</p>
        </div>
        <ul className="col-span-8 grid gap-2">
          {([5, 4, 3, 2, 1] as const).map((s) => {
            const n = summary.counts[s];
            const pct = summary.total ? Math.round((n / summary.total) * 100) : 0;
            return (
              <li key={s} className="flex items-center gap-3 text-[13px]">
                <span className="flex w-12 shrink-0 items-center gap-1 text-foreground">
                  {s} <Star className="size-3.5 fill-warning text-warning" />
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                  <span className="block h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                </span>
                <span className="w-24 shrink-0 text-right text-muted-foreground tabular-nums">
                  {formatNumber(n)} · {pct}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Bộ lọc + xuất */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Lọc đánh giá" className="flex flex-wrap items-center gap-2">
          <Link href={buildHref(pathname, sp, { stars: null, page: null })} scroll={false} className={chip(!filters.stars)}>
            Tất cả
          </Link>
          {[5, 4, 3, 2, 1].map((s) => (
            <Link
              key={s}
              href={buildHref(pathname, sp, { stars: s, page: null })}
              scroll={false}
              aria-current={filters.stars === s ? "true" : undefined}
              className={chip(filters.stars === s)}
            >
              {s} <Star className="size-3.5" />
            </Link>
          ))}
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <Link
            href={buildHref(pathname, sp, { comment: filters.withComment ? null : "1", page: null })}
            scroll={false}
            aria-pressed={filters.withComment}
            className={chip(filters.withComment)}
          >
            <MessageSquareText className="size-3.5" />
            Chỉ có nhận xét
          </Link>
        </nav>
        <a href={`${pathname}/reviews/export${exportQuery ? `?${exportQuery}` : ""}`} className={buttonVariants({ variant: "outline" })} download>
          <Download />
          Xuất Excel
        </a>
      </div>

      {/* Danh sách */}
      {list.rows.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-muted-foreground">Không có đánh giá nào khớp bộ lọc.</p>
      ) : (
        <div className="-mx-6 border-t border-border">
          <ul className="divide-y divide-border">
            {list.rows.map((r) => (
              <li key={r.id} className="grid gap-2 px-6 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <StarRating value={r.rating} size="sm" />
                    <span className="font-medium text-foreground">{r.user.fullName}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {r.user.employeeCode}
                      {r.user.department ? ` · ${r.user.department.name}` : ""}
                    </span>
                  </div>
                  <span className="text-[13px] text-muted-foreground">
                    {formatDate(r.createdAt)}
                    {isEdited(r) && <span title={`Sửa lần cuối ${formatDate(r.updatedAt)}`}> (đã sửa)</span>}
                  </span>
                </div>
                {r.comment ? (
                  <p className="text-[15px] whitespace-pre-line text-foreground">{r.comment}</p>
                ) : (
                  <p className="text-[13px] text-muted-foreground italic">Không có nhận xét.</p>
                )}
              </li>
            ))}
          </ul>
          {list.total > REVIEWS_PAGE_SIZE && (
            <DataTablePagination pathname={pathname} searchParams={sp} page={page} pageSize={REVIEWS_PAGE_SIZE} total={list.total} />
          )}
        </div>
      )}
    </div>
  );
}
