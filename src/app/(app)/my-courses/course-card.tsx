import Link from "next/link";
import { CalendarClock, Lock, Play, Route, RotateCcw } from "lucide-react";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { ProgressBar } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { defaultCoverUrl } from "@/lib/course-cover";
import { LEARNER_SOURCE_LABELS } from "@/lib/enrollment-labels";
import { formatDate } from "@/lib/format";
import { dueHint, type MyEnrollment } from "@/lib/learning";
import type { PathLock } from "@/lib/path-lock";
import { cn } from "@/lib/utils";

/** Thẻ khoá học (design-system 5.7, theo Vuexy academy my-courses). */
export function CourseCard({
  enrollment: e,
  nextLessonId,
  hasUpdate = false,
  pathLock = null,
}: {
  enrollment: MyEnrollment;
  nextLessonId: string | null;
  /** Khoá 🔒 theo lộ trình: thẻ mờ, nút chính “Xem lộ trình” */
  pathLock?: PathLock | null;
  /** Có bản MINOR mới chưa xác nhận */
  hasUpdate?: boolean;
}) {
  const detailHref = `/my-courses/${e.course.id}`;
  const hint = e.status === "COMPLETED" ? null : dueHint(e.dueDate, e.overdue);
  const dueColor = hint ? (hint.tone === "destructive" ? "text-destructive" : "text-warning") : "text-muted-foreground";
  const source = LEARNER_SOURCE_LABELS[e.source];

  const action = pathLock
    ? { label: "Xem lộ trình", href: `/learning-paths/${pathLock.pathId}`, icon: Route, variant: "secondary" as const }
    : e.status === "COMPLETED"
      ? { label: "Xem lại", href: detailHref, icon: RotateCcw, variant: "secondary" as const }
      : e.status === "IN_PROGRESS"
        ? { label: "Tiếp tục", href: nextLessonId ? `/learn/${e.course.id}/${nextLessonId}` : detailHref, icon: Play, variant: "default" as const }
        : { label: "Bắt đầu", href: nextLessonId ? `/learn/${e.course.id}/${nextLessonId}` : detailHref, icon: Play, variant: "default" as const };
  const Icon = action.icon;

  return (
    <article className={cn("flex flex-col rounded-md border bg-card p-2", e.overdue ? "border-destructive/40" : "border-border")}>
      <Link href={detailHref} className={cn("relative block overflow-hidden rounded-md", pathLock && "opacity-50")} tabIndex={-1} aria-hidden>
        <CourseThumbnail
          thumbnailKey={e.course.thumbnailUrl}
          fallbackSrc={defaultCoverUrl(e.course.categoryId)}
          alt=""
          sizes="(min-width: 1280px) 400px, 33vw"
          className="w-full rounded-md"
        />
        {e.course.status === "ARCHIVED" && (
          <StatusBadge tone="secondary" className="absolute top-2 left-2 bg-card/90">
            Đã lưu trữ
          </StatusBadge>
        )}
        {pathLock && (
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-card/90 text-muted-foreground">
              <Lock className="size-6" />
            </span>
          </span>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {pathLock ? (
            <StatusBadge tone="primary" className="max-w-full truncate">
              Lộ trình: {pathLock.pathTitle}
            </StatusBadge>
          ) : (
            <StatusBadge tone={source.tone}>{source.label}</StatusBadge>
          )}
          <span className="truncate text-[13px] text-muted-foreground">{e.course.category?.name ?? "Chưa phân loại"}</span>
        </div>

        <Link
          href={detailHref}
          className={cn("line-clamp-2 min-h-[3em] text-lg leading-snug font-medium text-foreground hover:text-primary", pathLock && "text-foreground/60")}
        >
          {e.course.title}
        </Link>

        {pathLock && (
          <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Hoàn thành <span className="font-medium text-foreground">{pathLock.blockedBy.title}</span> để mở
            </span>
          </p>
        )}

        <div className="flex items-center gap-2 text-[13px]">
          <CalendarClock className={cn("size-4", dueColor)} />
          <span className={dueColor}>
            {e.status === "COMPLETED" && e.completedAt
              ? `Hoàn thành ${formatDate(e.completedAt)}`
              : e.dueDate
                ? `Hạn ${formatDate(e.dueDate)}`
                : "Không có hạn"}
          </span>
          {hint && <StatusBadge tone={hint.tone}>{hint.text}</StatusBadge>}
          {hasUpdate && (
            <Link href={`/my-courses/${e.course.id}/updates`} title="Xem phần thay đổi và xác nhận">
              <StatusBadge tone="info">Có cập nhật</StatusBadge>
            </Link>
          )}
        </div>

        <div className="mt-auto space-y-1.5">
          <div className="flex justify-between text-[13px]">
            <span className="text-muted-foreground">Tiến độ</span>
            <span className="font-medium text-foreground tabular-nums">{e.progressPercent}%</span>
          </div>
          <ProgressBar value={e.progressPercent} label={`Tiến độ khoá ${e.course.title}`} />
        </div>

        <Link href={action.href} prefetch={false} className={cn(buttonVariants({ variant: action.variant }), "w-full")}>
          <Icon />
          {action.label}
        </Link>
      </div>
    </article>
  );
}
