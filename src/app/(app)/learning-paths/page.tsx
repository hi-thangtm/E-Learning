import type { Metadata } from "next";
import Link from "next/link";
import { CalendarClock, CheckCircle2, Route } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ProgressBar } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/lib/current-user";
import { formatDate } from "@/lib/format";
import { getMyPaths } from "@/lib/my-paths";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Lộ trình của tôi" };

/** Lộ trình được giao cho chính người đăng nhập (Việc 23B). */
export default async function MyPathsPage() {
  const user = await requireUser();
  const paths = await getMyPaths(user.id);

  return (
    <>
      <PageHeader title="Lộ trình" description="Chuỗi khoá học theo thứ tự — hoàn thành khoá trước để mở khoá sau." />
      {paths.length === 0 ? (
        <EmptyState
          icon={Route}
          title="Bạn chưa được giao lộ trình nào"
          description="Khi quản trị đào tạo giao lộ trình, các khoá trong lộ trình sẽ hiện ở đây theo thứ tự."
          className="rounded-md bg-card shadow-md"
          action={
            <Link href="/my-courses" className={buttonVariants({ variant: "secondary" })}>
              Xem khoá học của tôi
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {paths.map((p) => (
            <Link
              key={p.id}
              href={`/learning-paths/${p.id}`}
              className={cn(
                "flex flex-col gap-4 rounded-md border bg-card p-5 shadow-sm transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50",
                p.overdue ? "border-destructive/40" : "border-border",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-md bg-primary/16 text-primary">
                  <Route className="size-6" />
                </span>
                {p.completed ? (
                  <StatusBadge tone="success">Hoàn thành</StatusBadge>
                ) : p.overdue ? (
                  <StatusBadge tone="destructive">Quá hạn</StatusBadge>
                ) : (
                  <StatusBadge tone="primary">Đang học</StatusBadge>
                )}
              </div>
              <div className="space-y-1">
                <p className="line-clamp-2 text-lg leading-normal break-words font-medium text-foreground">{p.title}</p>
                {p.description && <p className="line-clamp-2 text-[13px] text-muted-foreground">{p.description}</p>}
              </div>
              <div className="mt-auto space-y-1.5">
                <div className="flex justify-between text-[13px]">
                  <span className="text-muted-foreground">
                    {p.completedCount}/{p.totalCount} khoá
                  </span>
                  <span className="font-medium text-foreground tabular-nums">{p.percent}%</span>
                </div>
                <ProgressBar value={p.percent} label={`Tiến độ lộ trình ${p.title}`} />
              </div>
              <p className={cn("flex items-center gap-1.5 text-[13px]", p.overdue ? "text-destructive" : "text-muted-foreground")}>
                {p.completed ? <CheckCircle2 className="size-4 text-success" /> : <CalendarClock className="size-4" />}
                {p.completed ? "Đã hoàn thành mọi khoá" : p.dueDate ? `Hạn ${formatDate(p.dueDate)}` : "Không có hạn"}
              </p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
