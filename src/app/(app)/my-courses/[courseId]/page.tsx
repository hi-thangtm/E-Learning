import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock,
  FileText,
  ListChecks,
  Lock,
  Play,
  PlayCircle,
  RotateCcw,
} from "lucide-react";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { ProgressRing } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { defaultCoverUrl } from "@/lib/course-cover";
import { requireUser } from "@/lib/current-user";
import { LEARNER_SOURCE_LABELS } from "@/lib/enrollment-labels";
import { formatDate } from "@/lib/format";
import { dueHint, getCourseOutline, getMyEnrollment, type OutlineLesson } from "@/lib/learning";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/youtube";

export const metadata: Metadata = { title: "Giới thiệu khoá học" };

const LESSON_ICON = { VIDEO: PlayCircle, DOCUMENT: FileText, QUIZ: ListChecks } as const;
const LESSON_TYPE_LABEL = { VIDEO: "Video", DOCUMENT: "Tài liệu", QUIZ: "Bài kiểm tra" } as const;

/** Giới thiệu khoá (mục 2.3) — chỉ mở được khi chính mình có lượt học (khác CANCELLED). */
export default async function MyCourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  const { courseId } = await params;

  const enrollment = await getMyEnrollment(user.id, courseId);
  if (!enrollment) redirect("/my-courses");

  const outline = await getCourseOutline(user.id, courseId);
  const course = enrollment.course;
  const overdue = !!enrollment.dueDate && enrollment.dueDate < new Date() && enrollment.status !== "COMPLETED";
  const hint = enrollment.status === "COMPLETED" ? null : dueHint(enrollment.dueDate, overdue);
  const source = LEARNER_SOURCE_LABELS[enrollment.source];
  const allDone = outline.totalLessons > 0 && outline.completedLessons === outline.totalLessons;

  // Nút chính
  const main =
    outline.totalLessons === 0
      ? null
      : allDone || enrollment.status === "COMPLETED"
        ? { label: "Xem lại khoá học", lessonId: outline.firstLessonId, icon: RotateCcw }
        : outline.completedLessons === 0 && !outline.sections.some((s) => s.lessons.some((l) => l.inProgress))
          ? { label: "Bắt đầu học", lessonId: outline.nextLessonId, icon: Play }
          : { label: "Tiếp tục học", lessonId: outline.nextLessonId, icon: Play };
  const MainIcon = main?.icon;

  return (
    <div className="space-y-6">
      <Link href="/my-courses" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" />
        Khoá học của tôi
      </Link>

      {/* Đầu trang */}
      <section className="grid grid-cols-12 gap-6 rounded-md bg-card p-6 shadow-md">
        <CourseThumbnail
          thumbnailKey={course.thumbnailUrl}
          fallbackSrc={defaultCoverUrl(course.categoryId)}
          alt={course.title}
          sizes="420px"
          className="col-span-4 self-start rounded-md"
        />

        <div className="col-span-5 flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={source.tone}>{source.label}</StatusBadge>
            <span className="text-[13px] text-muted-foreground">{course.category?.name ?? "Chưa phân loại"}</span>
            {course.currentVersion > 0 && <span className="text-[13px] text-muted-foreground">· Phiên bản v{course.currentVersion}</span>}
            {course.status === "ARCHIVED" && <StatusBadge tone="secondary">Đã lưu trữ</StatusBadge>}
          </div>
          <h1 className="text-2xl font-medium text-foreground">{course.title}</h1>
          {course.description ? (
            <p className="text-[15px] whitespace-pre-line text-muted-foreground">{course.description}</p>
          ) : (
            <p className="text-[15px] text-muted-foreground italic">Khoá học chưa có mô tả.</p>
          )}

          <dl className="mt-auto grid grid-cols-3 gap-4 border-t border-border pt-4 text-[13px]">
            <div>
              <dt className="text-muted-foreground">Hạn hoàn thành</dt>
              <dd
                className={cn(
                  "mt-1 flex flex-wrap items-center gap-1.5 font-medium",
                  hint ? (hint.tone === "destructive" ? "text-destructive" : "text-warning") : "text-foreground",
                )}
              >
                <CalendarClock className="size-4" />
                {enrollment.dueDate ? formatDate(enrollment.dueDate) : "Không có hạn"}
                {hint && <StatusBadge tone={hint.tone}>{hint.text}</StatusBadge>}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Số bài học</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
                <BookOpen className="size-4" />
                {outline.totalLessons} bài
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Thời lượng video</dt>
              <dd className="mt-1 flex items-center gap-1.5 font-medium text-foreground">
                <Clock className="size-4" />
                {outline.totalVideoSeconds > 0 ? formatDuration(outline.totalVideoSeconds) : "Không có video"}
              </dd>
            </div>
          </dl>
        </div>

        <div className="col-span-3 flex flex-col items-center justify-center gap-4 rounded-md bg-muted/50 p-4 text-center">
          <ProgressRing value={outline.progressPercent} size={112} stroke={10} />
          <p className="text-[13px] text-muted-foreground">
            Đã xong {outline.completedLessons}/{outline.totalLessons} bài
            {enrollment.status === "COMPLETED" && enrollment.completedAt && (
              <>
                <br />
                Hoàn thành {formatDate(enrollment.completedAt)}
              </>
            )}
          </p>
          {main?.lessonId && MainIcon && (
            <Link
              href={`/learn/${course.id}/${main.lessonId}`}
              prefetch={false}
              className={cn(buttonVariants({ variant: main.label === "Xem lại khoá học" ? "secondary" : "default" }), "w-full")}
            >
              <MainIcon />
              {main.label}
            </Link>
          )}
        </div>
      </section>

      {/* Mục lục */}
      <section className="rounded-md bg-card shadow-md">
        <header className="p-6 pb-4">
          <h2 className="text-lg font-medium text-foreground">Nội dung khoá học</h2>
          <p className="text-[13px] text-muted-foreground">Học lần lượt từng bài: hoàn thành bài trước để mở bài sau.</p>
        </header>

        {outline.sections.length === 0 || outline.totalLessons === 0 ? (
          <p className="px-6 pb-6 text-[15px] text-muted-foreground">Khoá học chưa có bài học nào.</p>
        ) : (
          <div className="divide-y divide-border border-t border-border">
            {outline.sections.map((s, i) => {
              const done = s.lessons.filter((l) => l.completed).length;
              return (
                <details key={s.id} open className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-3 bg-muted/40 px-6 py-3 select-none [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-5 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      Chương {i + 1}: {s.title}
                    </span>
                    <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                      {done}/{s.lessons.length} bài
                    </span>
                  </summary>
                  {s.lessons.length === 0 ? (
                    <p className="px-6 py-3 pl-14 text-[13px] text-muted-foreground">Chương chưa có bài học.</p>
                  ) : (
                    <ul>
                      {s.lessons.map((l) => (
                        <li key={l.id}>
                          <LessonRow courseId={course.id} lesson={l} current={l.id === outline.nextLessonId} />
                        </li>
                      ))}
                    </ul>
                  )}
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function LessonRow({ courseId, lesson: l, current }: { courseId: string; lesson: OutlineLesson; current: boolean }) {
  const Icon = LESSON_ICON[l.type];
  const body = (
    <>
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          l.locked ? "bg-muted text-muted-foreground" : "bg-primary/16 text-primary",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block truncate", l.locked ? "text-muted-foreground" : "text-foreground")}>{l.title}</span>
        <span className="text-[13px] text-muted-foreground">
          {LESSON_TYPE_LABEL[l.type]}
          {l.durationSeconds ? ` · ${formatDuration(l.durationSeconds)}` : ""}
        </span>
      </span>
      {l.inProgress && <StatusBadge tone="primary">Đang học</StatusBadge>}
      {current && !l.inProgress && <StatusBadge tone="warning">Bài tiếp theo</StatusBadge>}
      {l.completed ? (
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Đã hoàn thành" />
      ) : l.locked ? (
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Chưa mở" />
      ) : (
        <span className="size-5 shrink-0" />
      )}
    </>
  );

  const rowClass = "flex items-center gap-3 px-6 py-3 pl-14";
  if (l.locked) {
    return (
      <div className={cn(rowClass, "cursor-not-allowed")} title="Hoàn thành bài trước để mở" aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <Link href={`/learn/${courseId}/${l.id}`} prefetch={false} className={cn(rowClass, "transition-colors hover:bg-primary/8")}>
      {body}
    </Link>
  );
}
