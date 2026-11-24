import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Award, BookOpen, CheckCircle2, ChevronRight, CirclePlay, Clock, FileText, Inbox, ListChecks, PlayCircle, TriangleAlert } from "lucide-react";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { VersionUpdateBanner } from "@/components/learning/version-update-banner";
import { getPendingAcknowledgements } from "@/lib/acknowledgements";
import { ProgressBar } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { defaultCoverUrl } from "@/lib/course-cover";
import { requireUser } from "@/lib/current-user";
import { formatDate, formatPercent } from "@/lib/format";
import { dueHint, getContinueLearning, getMyStats, getTodoEnrollments } from "@/lib/learning";
import { ROLE_LABELS } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = { title: "Tổng quan" };

const LESSON_ICON = { VIDEO: PlayCircle, DOCUMENT: FileText, QUIZ: ListChecks } as const;

/** Tổng quan học viên (mục 2.2) — chỉ dữ liệu của chính người đăng nhập. */
export default async function DashboardPage() {
  const user = await requireUser();
  const [stats, todo, continueLearning, pendingUpdates] = await Promise.all([
    getMyStats(user.id),
    getTodoEnrollments(user.id, 5),
    getContinueLearning(user.id, 3),
    getPendingAcknowledgements(user.id),
  ]);
  const hasAnything = stats.inProgress + stats.notStarted + stats.completed > 0 || todo.length > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-medium break-words text-foreground sm:text-2xl">Xin chào, {user.fullName} 👋</h1>
        <p className="text-[15px] text-muted-foreground">
          {user.employeeCode} · {ROLE_LABELS[user.role]} · {user.company.name}
        </p>
      </div>

      {/* Quy trình có cập nhật (bản MINOR chưa xác nhận) */}
      <VersionUpdateBanner items={pendingUpdates} />

      {/* 5 thẻ, mỗi thẻ đúng 1 trạng thái (Việc 33 F4); bấm → tab tương ứng ở Khoá học của tôi */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-5">
        <StatCard
          href="/my-courses?tab=notStarted"
          label="Chưa bắt đầu"
          value={stats.notStarted}
          hint={stats.notStarted > 0 ? "Khoá được giao chưa mở bài nào" : "Không có khoá chờ bắt đầu"}
          icon={<CirclePlay />}
          tone="info"
        />
        <StatCard href="/my-courses?tab=inProgress" label="Đang học" value={stats.inProgress} hint="Khoá học đã bắt đầu học" icon={<BookOpen />} tone="primary" />
        <StatCard href="/my-courses?tab=completed" label="Đã hoàn thành" value={stats.completed} hint="Khoá học đã học xong" icon={<CheckCircle2 />} tone="success" />
        <StatCard
          href="/my-courses?tab=overdue"
          label="Quá hạn"
          value={stats.overdue}
          hint={stats.overdue > 0 ? "Cần hoàn thành ngay" : "Không có khoá quá hạn"}
          icon={<TriangleAlert />}
          tone={stats.overdue > 0 ? "destructive" : "secondary"}
        />
        <StatCard href="/certificates" label="Chứng nhận" value={stats.certificates} hint="Chứng nhận còn hiệu lực" icon={<Award />} tone="warning" />
      </div>

      {!hasAnything ? (
        <EmptyState
          icon={Inbox}
          title="Bạn chưa được giao khoá học nào"
          description="Khi quản trị đào tạo giao khoá học, khoá sẽ hiện ở đây kèm hạn hoàn thành. Trong lúc chờ, bạn có thể xem các khoá cho phép tự đăng ký."
          className="rounded-md bg-card shadow-md"
          action={
            <Link href="/library" className={buttonVariants()}>
              Mở Thư viện khoá học
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Cần làm */}
          <section className="min-w-0 rounded-md bg-card shadow-md lg:col-span-7">
            <header className="flex items-center justify-between gap-3 p-4 pb-3 sm:p-6 sm:pb-4">
              <div>
                <h2 className="text-lg font-medium text-foreground">Cần làm</h2>
                <p className="text-[13px] text-muted-foreground">Khoá chưa xong, hạn gần nhất trước</p>
              </div>
              <Link href="/my-courses" className="inline-flex shrink-0 items-center gap-1 text-[15px] whitespace-nowrap text-primary hover:underline">
                Xem tất cả
                <ChevronRight className="size-4" />
              </Link>
            </header>
            {todo.length === 0 ? (
              <p className="px-4 pb-4 text-[15px] sm:px-6 sm:pb-6 text-muted-foreground">Bạn đã hoàn thành mọi khoá được giao. 🎉</p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {todo.map((e) => {
                  const hint = dueHint(e.dueDate, e.overdue);
                  return (
                    <li key={e.id}>
                      <Link
                        href={`/my-courses/${e.course.id}`}
                        className={cn("flex items-center gap-3 px-4 py-4 transition-colors hover:bg-muted/50 sm:gap-4 sm:px-6", e.overdue && "bg-destructive/5")}
                      >
                        <CourseThumbnail thumbnailKey={e.course.thumbnailUrl} fallbackSrc={defaultCoverUrl(e.course.categoryId)} alt="" className="w-16 shrink-0 sm:w-20" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <p className="line-clamp-2 font-medium break-words text-foreground sm:truncate" title={e.course.title}>
                            {e.course.title}
                          </p>
                          <div className="flex items-center gap-3">
                            <ProgressBar value={e.progressPercent} className="max-w-48" />
                            <span className="text-[13px] text-muted-foreground tabular-nums">{formatPercent(e.progressPercent, 0)}</span>
                          </div>
                          {/* Điện thoại: hạn + nhãn xuống dưới tên khoá */}
                          <div className="flex flex-wrap items-center gap-2 sm:hidden">
                            <span className={cn("text-[13px]", hint ? (hint.tone === "destructive" ? "text-destructive" : "text-warning") : "text-muted-foreground")}>
                              <Clock className="mr-1 inline size-3.5 align-[-2px]" />
                              {e.dueDate ? formatDate(e.dueDate) : "Không có hạn"}
                            </span>
                            {hint && <StatusBadge tone={hint.tone}>{hint.text}</StatusBadge>}
                          </div>
                        </div>
                        <div className="hidden shrink-0 text-right sm:block">
                          <p className={cn("text-[13px]", hint ? (hint.tone === "destructive" ? "text-destructive" : "text-warning") : "text-muted-foreground")}>
                            <Clock className="mr-1 inline size-3.5 align-[-2px]" />
                            {e.dueDate ? formatDate(e.dueDate) : "Không có hạn"}
                          </p>
                          {hint && <StatusBadge tone={hint.tone}>{hint.text}</StatusBadge>}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* Tiếp tục học */}
          <section className="min-w-0 self-start rounded-md bg-card shadow-md lg:col-span-5">
            <header className="p-4 pb-3 sm:p-6 sm:pb-4">
              <h2 className="text-lg font-medium text-foreground">Tiếp tục học</h2>
              <p className="text-[13px] text-muted-foreground">Bài bạn đang học dở</p>
            </header>
            {continueLearning.length === 0 ? (
              <p className="px-4 pb-4 text-[15px] sm:px-6 sm:pb-6 text-muted-foreground">Chưa có bài nào đang học dở. Bấm “Bắt đầu” ở một khoá để học bài đầu tiên.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 px-4 pb-4 sm:px-6 sm:pb-6">
                {continueLearning.map((c) => {
                  const Icon = LESSON_ICON[c.lessonType];
                  return (
                    <li key={c.lessonId}>
                      <Link
                        href={`/learn/${c.course.id}/${c.lessonId}`}
                        prefetch={false}
                        className="flex items-center gap-3 rounded-md border border-border p-3 transition-colors hover:border-primary hover:bg-primary/8"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/16 text-primary">
                          <Icon className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <p className="truncate text-[13px] text-muted-foreground">{c.course.title}</p>
                          <p className="truncate font-medium text-foreground">{c.lessonTitle}</p>
                          <div className="flex items-center gap-2">
                            <ProgressBar value={c.progressPercent} label="Tiến độ khoá học" />
                            <span className="text-[12px] text-muted-foreground tabular-nums">{formatPercent(c.progressPercent, 0)}</span>
                          </div>
                        </div>
                        <ChevronRight className="size-5 shrink-0 text-foreground/40" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

const TONES = {
  primary: "bg-primary/16 text-primary",
  info: "bg-info/16 text-info",
  success: "bg-success/16 text-success",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/16 text-destructive",
  secondary: "bg-secondary text-secondary-foreground",
} as const;

/** Thẻ số liệu (design-system 5.1): tiêu đề, số lớn, mô tả, ô icon tonal 42px bên phải. */
function StatCard({
  href,
  label,
  value,
  hint,
  icon,
  tone,
}: {
  href: string;
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone: keyof typeof TONES;
}) {
  return (
    <Link href={href} className="flex min-w-0 items-start justify-between gap-2 rounded-md bg-card p-4 shadow-md transition-shadow hover:shadow-lg sm:p-6">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-[15px] text-foreground">{label}</p>
        <p className={cn("text-2xl font-medium", tone === "destructive" ? "text-destructive" : "text-foreground")}>{value}</p>
        <p className="text-[13px] text-muted-foreground">{hint}</p>
      </div>
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-md sm:size-[42px] [&_svg]:size-5 sm:[&_svg]:size-[26px]", TONES[tone])}>{icon}</span>
    </Link>
  );
}
