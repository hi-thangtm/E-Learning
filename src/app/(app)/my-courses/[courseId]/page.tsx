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
  Route,
  BadgeCheck,
  RefreshCcw,
} from "lucide-react";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { ProgressRing } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { defaultCoverUrl } from "@/lib/course-cover";
import { getPendingAcknowledgements, getVersionNote } from "@/lib/acknowledgements";
import { LessonContent } from "@/components/learning/lesson-content";
import { VersionUpdateBanner } from "@/components/learning/version-update-banner";
import { requireUser } from "@/lib/current-user";
import { LEARNER_SOURCE_LABELS } from "@/lib/enrollment-labels";
import { formatDate, formatDuration } from "@/lib/format";
import { dueHint, getCourseOutline, getMyEnrollment, type OutlineLesson } from "@/lib/learning";
import { cancellableSelfEnrollment } from "@/lib/library";
import { canReview, getMyReview } from "@/lib/reviews";
import { CancelEnrollmentButton } from "./cancel-enrollment-button";
import { MyReview } from "./my-review";
import { cn } from "@/lib/utils";
import { pageTitle } from "@/lib/page-title";
import { prisma } from "@/lib/db";

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const { courseId } = await params;
  // Chỉ khoá mình đang có lượt học
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: user.id, courseId, status: { not: "CANCELLED" } },
    select: { course: { select: { title: true } } },
  });
  return { title: pageTitle(enrollment?.course.title, "Khoá học của tôi") };
}

const LESSON_ICON = { VIDEO: PlayCircle, DOCUMENT: FileText, QUIZ: ListChecks } as const;
const LESSON_TYPE_LABEL = { VIDEO: "Video", DOCUMENT: "Tài liệu", QUIZ: "Bài kiểm tra" } as const;

/** Giới thiệu khoá (mục 2.3) — chỉ mở được khi chính mình có lượt học (khác CANCELLED). */
export default async function MyCourseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ locked?: string }>;
}) {
  const user = await requireUser();
  const { courseId } = await params;

  const enrollment = await getMyEnrollment(user.id, courseId);
  if (!enrollment) redirect("/my-courses");

  const course = enrollment.course;
  const [outline, pendingUpdates, versionNote, cancellable, reviewable, myReview] = await Promise.all([
    getCourseOutline(user.id, courseId),
    getPendingAcknowledgements(user.id, courseId),
    getVersionNote(courseId, enrollment, course.currentVersion),
    // Tự đăng ký, chưa học gì -> cho huỷ đăng ký (Việc 24)
    enrollment.source === "SELF" && enrollment.status === "NOT_STARTED" ? cancellableSelfEnrollment(user.id, courseId) : null,
    // Đánh giá (Việc 25): chỉ khi đã học xong
    canReview(user.id, courseId),
    getMyReview(user.id, courseId),
  ]);
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
  // Khoá 🔒 theo lộ trình (Việc 23B): nút chính chuyển thành “Xem lộ trình”
  const pathLock = outline.pathLock;

  return (
    <div className="space-y-6">
      <Link href="/my-courses" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" />
        Khoá học của tôi
      </Link>

      {/* Đầu trang */}
      <section className="grid grid-cols-1 gap-6 rounded-md bg-card p-4 shadow-md sm:p-6 lg:grid-cols-12">
        <CourseThumbnail
          thumbnailKey={course.thumbnailUrl}
          fallbackSrc={defaultCoverUrl(course.categoryId)}
          alt={course.title}
          sizes="420px"
          className="self-start rounded-md lg:col-span-4"
        />

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-5">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={source.tone}>{source.label}</StatusBadge>
            <span className="text-[13px] text-muted-foreground">{course.category?.name ?? "Chưa phân loại"}</span>
            {course.currentVersion > 0 && <span className="text-[13px] text-muted-foreground">· Phiên bản v{course.currentVersion}</span>}
            {course.status === "ARCHIVED" && <StatusBadge tone="secondary">Đã lưu trữ</StatusBadge>}
          </div>
          <h1 className="text-xl font-medium break-words text-foreground sm:text-2xl">{course.title}</h1>
          {course.description ? (
            <p className="text-[15px] whitespace-pre-line text-muted-foreground">{course.description}</p>
          ) : (
            <p className="text-[15px] text-muted-foreground italic">Khoá học chưa có mô tả.</p>
          )}

          <dl className="mt-auto grid grid-cols-2 gap-4 border-t border-border pt-4 text-[13px] sm:grid-cols-3">
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

        <div className="flex flex-col items-center justify-center gap-4 rounded-md bg-muted/50 p-4 text-center lg:col-span-3">
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
          {pathLock ? (
            <Link href={`/learning-paths/${pathLock.pathId}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
              <Route />
              Xem lộ trình
            </Link>
          ) : main?.lessonId && MainIcon && (
            <Link
              href={`/learn/${course.id}/${main.lessonId}`}
              prefetch={false}
              className={cn(buttonVariants({ variant: main.label === "Xem lại khoá học" ? "outline" : "default" }), "w-full")}
            >
              <MainIcon />
              {main.label}
            </Link>
          )}
          {cancellable && <CancelEnrollmentButton courseId={course.id} courseTitle={course.title} />}
        </div>
      </section>

      {/* Mở link bài chưa mở (thông báo / dấu trang) → trang học chuyển về đây kèm ?locked=1 (ui-review F7) */}
      {!pathLock && (await searchParams).locked === "1" && (
        <section role="status" className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/16 px-5 py-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="space-y-1">
            <p className="text-[15px] font-medium text-foreground">Bài này chưa mở</p>
            <p className="text-[15px] text-muted-foreground">Học lần lượt từng bài: hoàn thành bài trước để mở bài tiếp theo (bài đang mở có nhãn “Bài tiếp theo” bên dưới).</p>
          </div>
        </section>
      )}

      {pathLock && (
        <section role="status" className="flex items-start gap-3 rounded-md border border-border bg-muted px-5 py-4">
          <Lock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1">
            <p className="text-[15px] font-medium text-foreground">
              Khoá này thuộc lộ trình “{pathLock.pathTitle}” và chưa được mở
            </p>
            <p className="text-[15px] text-muted-foreground">
              Hoàn thành <span className="font-medium text-foreground">{pathLock.blockedBy.title}</span> để mở khoá này.{" "}
              <Link href={`/learning-paths/${pathLock.pathId}`} className="text-primary hover:underline">
                Xem lộ trình
              </Link>
            </p>
          </div>
        </section>
      )}

      {/* Phiên bản: cần xác nhận bản MINOR / đã nắm bản hiện tại / phải học lại do MAJOR */}
      <VersionUpdateBanner items={pendingUpdates} single />
      {pendingUpdates.length === 0 && versionNote?.kind === "current" && (
        <p className="flex items-center gap-2 rounded-md bg-success/8 px-4 py-3 text-[15px] text-success">
          <BadgeCheck className="size-5 shrink-0" />
          Bạn đã nắm phiên bản v{versionNote.version}
          {versionNote.acknowledgedAt && ` (cập nhật ${formatDate(versionNote.acknowledgedAt)})`}.
        </p>
      )}
      {versionNote?.kind === "major" && (
        <section role="status" className="rounded-md border border-warning/40 bg-warning/16 p-5">
          <p className="flex items-center gap-2 text-[15px] font-medium text-warning">
            <RefreshCcw className="size-5 shrink-0" />
            Khoá có thay đổi lớn ở phiên bản v{versionNote.versionNo} — bạn cần học lại
          </p>
          {versionNote.summaryHtml && (
            <details className="mt-2">
              <summary className="cursor-pointer text-[13px] font-medium text-primary">Xem tóm tắt thay đổi</summary>
              <div className="mt-2 rounded-md bg-card p-4">
                <LessonContent html={versionNote.summaryHtml} />
              </div>
            </details>
          )}
        </section>
      )}

      {reviewable && (
        <MyReview courseId={course.id} initial={myReview && { rating: myReview.rating, comment: myReview.comment }} />
      )}

      {/* Mục lục */}
      <section className="rounded-md bg-card shadow-md">
        <header className="p-4 pb-3 sm:p-6 sm:pb-4">
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
                  <summary className="flex cursor-pointer list-none items-center gap-3 bg-muted/40 px-4 py-3 select-none sm:px-6 [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-5 shrink-0 -rotate-90 text-muted-foreground transition-transform group-open:rotate-0" />
                    <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                      Chương {i + 1}: {s.title}
                    </span>
                    <span className="shrink-0 text-[13px] text-muted-foreground tabular-nums">
                      {done}/{s.lessons.length} bài
                    </span>
                  </summary>
                  {s.lessons.length === 0 ? (
                    <p className="px-4 py-3 pl-11 text-[13px] text-muted-foreground sm:px-6 sm:pl-14">Chương chưa có bài học.</p>
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
        <span className={cn("line-clamp-2 break-words sm:block sm:truncate", l.locked ? "text-muted-foreground" : "text-foreground")} title={l.title}>
          {l.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          {LESSON_TYPE_LABEL[l.type]}
          {l.durationSeconds ? ` · ${formatDuration(l.durationSeconds)}` : ""}
          {/* Điện thoại: nhãn xuống dòng phụ (không chiếm chỗ tên bài) */}
          {l.inProgress && <StatusBadge tone="primary" className="sm:hidden">Đang học</StatusBadge>}
          {current && !l.inProgress && <StatusBadge tone="warning" className="sm:hidden">Bài tiếp theo</StatusBadge>}
        </span>
      </span>
      {l.inProgress && <StatusBadge tone="primary" className="hidden sm:inline-flex">Đang học</StatusBadge>}
      {current && !l.inProgress && <StatusBadge tone="warning" className="hidden sm:inline-flex">Bài tiếp theo</StatusBadge>}
      {l.completed ? (
        <CheckCircle2 className="size-5 shrink-0 text-success" aria-label="Đã hoàn thành" />
      ) : l.locked ? (
        <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Chưa mở" />
      ) : (
        <span className="size-5 shrink-0" />
      )}
    </>
  );

  const rowClass = "flex items-center gap-3 px-4 py-3 pl-11 sm:px-6 sm:pl-14";
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
