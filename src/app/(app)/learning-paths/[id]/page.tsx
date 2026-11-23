import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, Check, ChevronLeft, Lock, Play, RotateCcw } from "lucide-react";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { ProgressBar, ProgressRing } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { defaultCoverUrl } from "@/lib/course-cover";
import { requireUser } from "@/lib/current-user";
import { formatDate, formatPercent } from "@/lib/format";
import { getNextLessonIds } from "@/lib/learning";
import { getMyPath, type PathStep } from "@/lib/my-paths";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Lộ trình" };

/** Chi tiết lộ trình của tôi: dòng thời gian các khoá theo thứ tự (Việc 23B). */
export default async function MyPathDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const path = await getMyPath(user.id, id);
  if (!path) redirect("/learning-paths");

  const open = path.steps.filter((s) => s.state === "open").map((s) => s.course.id);
  const nextLessons = await getNextLessonIds(user.id, open);

  return (
    <div className="space-y-6">
      <Link href="/learning-paths" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-4" />
        Lộ trình
      </Link>

      <section className="flex flex-col gap-4 rounded-md bg-card p-4 shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-medium break-words text-foreground sm:text-2xl">{path.title}</h1>
            {path.completed ? (
              <StatusBadge tone="success">Hoàn thành</StatusBadge>
            ) : path.overdue ? (
              <StatusBadge tone="destructive">Quá hạn</StatusBadge>
            ) : (
              <StatusBadge tone="primary">Đang học</StatusBadge>
            )}
          </div>
          {path.description && <p className="max-w-3xl text-[15px] whitespace-pre-line text-muted-foreground">{path.description}</p>}
          <p className={cn("flex items-center gap-1.5 text-[15px]", path.overdue ? "text-destructive" : "text-muted-foreground")}>
            <CalendarClock className="size-4" />
            {path.dueDate ? `Hạn chung ${formatDate(path.dueDate)}` : "Không có hạn"}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2">
          <ProgressRing value={path.percent} size={104} stroke={10} />
          <p className="text-[13px] text-muted-foreground">
            Đã xong {path.completedCount}/{path.totalCount} khoá
          </p>
        </div>
      </section>

      <section className="rounded-md bg-card p-6 shadow-md">
        <h2 className="mb-1 text-lg font-medium text-foreground">Các khoá trong lộ trình</h2>
        <p className="mb-6 text-[13px] text-muted-foreground">Học lần lượt: hoàn thành khoá trước để mở khoá sau.</p>
        <ol className="relative">
          {path.steps.map((s, i) => (
            <TimelineItem key={s.course.id} step={s} index={i} last={i === path.steps.length - 1} nextLessonId={nextLessons.get(s.course.id) ?? null} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function TimelineItem({ step: s, index, last, nextLessonId }: { step: PathStep; index: number; last: boolean; nextLessonId: string | null }) {
  const locked = s.state === "locked";
  const marker =
    s.state === "completed" ? (
      <span className="flex size-9 items-center justify-center rounded-full bg-success text-primary-foreground">
        <Check className="size-5" />
      </span>
    ) : s.state === "open" ? (
      <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <Play className="size-4" />
      </span>
    ) : (
      <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Lock className="size-4" />
      </span>
    );

  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {/* Đường nối dọc */}
      {!last && <span className="absolute top-9 bottom-0 left-[17px] w-0.5 bg-border" aria-hidden />}
      <span className="relative z-10 shrink-0">{marker}</span>

      {/* Điện thoại: ảnh + chữ ở trên, nút đầy chiều ngang ở dưới */}
      <div className={cn("flex min-w-0 flex-1 flex-col gap-3 rounded-md border border-border p-3 sm:flex-row sm:items-center sm:gap-4", locked && "bg-muted/40")}>
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
        <CourseThumbnail
          thumbnailKey={s.course.thumbnailUrl}
          fallbackSrc={defaultCoverUrl(s.course.categoryId)}
          alt=""
          className={cn("w-16 shrink-0 sm:w-28", locked && "opacity-50")}
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="text-[13px] text-muted-foreground">Khoá {index + 1}</p>
          <p className={cn("line-clamp-2 font-medium break-words sm:truncate", locked ? "text-foreground/60" : "text-foreground")} title={s.course.title}>
            {s.course.title}
          </p>
          {s.state === "completed" && <StatusBadge tone="success">✓ Hoàn thành</StatusBadge>}
          {s.state === "open" && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
              <StatusBadge tone="primary">Đang mở</StatusBadge>
              <ProgressBar value={s.progressPercent} className="max-w-40 min-w-24 flex-1" label={`Tiến độ khoá ${s.course.title}`} />
              <span className="text-[13px] text-muted-foreground tabular-nums">{formatPercent(s.progressPercent, 0)}</span>
            </div>
          )}
          {locked && s.blockedBy && (
            <p className="text-[13px] text-muted-foreground">
              <Lock className="mr-1 inline size-3.5 align-[-2px]" />
              Hoàn thành <span className="font-medium text-foreground">{s.blockedBy.title}</span> để mở
            </p>
          )}
        </div>
        </div>
        {s.state === "open" && (
          <Link
            href={nextLessonId ? `/learn/${s.course.id}/${nextLessonId}` : `/my-courses/${s.course.id}`}
            prefetch={false}
            className={cn(buttonVariants(), "h-10 w-full shrink-0 sm:h-[38px] sm:w-auto")}
          >
            <Play />
            Học ngay
          </Link>
        )}
        {s.state === "completed" && (
          <Link href={`/my-courses/${s.course.id}`} className={cn(buttonVariants({ variant: "outline" }), "h-10 w-full shrink-0 sm:h-[38px] sm:w-auto")}>
            <RotateCcw />
            Xem lại
          </Link>
        )}
      </div>
    </li>
  );
}
