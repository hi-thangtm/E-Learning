import Link from "next/link";
import { BookOpen, Clock, Star, Users } from "lucide-react";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { StatusBadge } from "@/components/status-badge";
import { defaultCoverUrl } from "@/lib/course-cover";
import { formatDuration, formatNumber } from "@/lib/format";
import { LIBRARY_STATUS_LABELS, type CourseStats, type LibraryStatus } from "@/lib/library";
import { formatRating, MIN_PUBLIC_REVIEWS } from "@/lib/reviews";

export type LibraryCourse = {
  id: string;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  categoryId: string | null;
  category: { name: string } | null;
};

/** Thẻ khoá trong Thư viện — cùng kiểu thẻ ở Khoá học của tôi (design-system 5.7). */
export function LibraryCard({
  course: c,
  stats,
  status,
  rating,
}: {
  course: LibraryCourse;
  stats: CourseStats;
  status: LibraryStatus | null;
  rating: { average: number; total: number } | null;
}) {
  const href = `/library/${c.id}`;
  const badge = status ? LIBRARY_STATUS_LABELS[status] : null;
  return (
    <article className="flex flex-col rounded-md border border-border bg-card p-2 transition-shadow hover:shadow-md">
      <Link href={href} className="relative block overflow-hidden rounded-md" tabIndex={-1} aria-hidden>
        <CourseThumbnail
          thumbnailKey={c.thumbnailUrl}
          fallbackSrc={defaultCoverUrl(c.categoryId)}
          alt=""
          sizes="(min-width: 1280px) 400px, 33vw"
          className="w-full rounded-md"
        />
        {badge && (
          <StatusBadge tone={badge.tone} className="absolute top-2 right-2 bg-card/95">
            {badge.label}
          </StatusBadge>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-2.5 p-3">
        <div className="flex items-center justify-between gap-2 text-[13px]">
          <span className="truncate text-muted-foreground">{c.category?.name ?? "Chưa phân loại"}</span>
          <RatingText rating={rating} />
        </div>
        <Link href={href} className="line-clamp-2 min-h-[3em] text-lg leading-normal break-words font-medium text-foreground hover:text-primary">
          {c.title}
        </Link>
        <p className="line-clamp-2 min-h-[2.8em] text-[13px] text-muted-foreground">{c.description || "Khoá học chưa có mô tả."}</p>
        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-3 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <BookOpen className="size-4" />
            {formatNumber(stats.lessonCount)} bài
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" />
            {stats.videoSeconds > 0 ? formatDuration(stats.videoSeconds) : "Không có video"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" />
            {formatNumber(stats.completedCount)} đã hoàn thành
          </span>
        </div>
      </div>
    </article>
  );
}

/** “★ 4,6 (12 đánh giá)” khi đủ MIN_PUBLIC_REVIEWS (3) lượt; ít hơn -> “Chưa đủ đánh giá”. Không hiện nhận xét. */
export function RatingText({ rating }: { rating: { average: number; total: number } | null }) {
  if (!rating || rating.total < MIN_PUBLIC_REVIEWS) return <span className="shrink-0 whitespace-nowrap text-muted-foreground">Chưa đủ đánh giá</span>;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
      <Star className="size-3.5 fill-warning text-warning" />
      <span className="font-medium text-foreground">{formatRating(rating.average)}</span>
      <span className="text-muted-foreground">({formatNumber(rating.total)} đánh giá)</span>
    </span>
  );
}
