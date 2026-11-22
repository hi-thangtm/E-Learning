import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BookOpen, CalendarClock, CheckCircle2, FileDiff } from "lucide-react";
import { LessonContent } from "@/components/learning/lesson-content";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { getPendingAcknowledgements, knownVersion } from "@/lib/acknowledgements";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AckButton } from "./ack-button";

export const metadata: Metadata = { title: "Có gì thay đổi" };

/** "Có gì thay đổi" (feature-spec 2.8): tóm tắt các bản MINOR chưa xác nhận + nút "Tôi đã đọc và nắm được". Chỉ chủ lượt học. */
export default async function CourseUpdatesPage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  const { courseId } = await params;
  if (!courseId || courseId.length > 50) redirect("/my-courses");

  const enrollment = await prisma.enrollment.findFirst({
    where: { userId: user.id, courseId, status: { not: "CANCELLED" } },
    select: {
      acknowledgedVersion: true,
      completedVersion: true,
      acknowledgedAt: true,
      course: { select: { id: true, title: true, currentVersion: true } },
    },
  });
  if (!enrollment) redirect("/my-courses");

  const [pending] = await getPendingAcknowledgements(user.id, courseId);
  const course = enrollment.course;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href={`/my-courses/${course.id}`} className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" />
        Về trang khoá học
      </Link>

      <section className="rounded-md bg-card p-6 shadow-md">
        <div className="flex items-start gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-info/16 text-info">
            <FileDiff className="size-6" />
          </span>
          <div className="min-w-0">
            <p className="text-[13px] text-muted-foreground">Có gì thay đổi</p>
            <h1 className="text-2xl font-medium text-foreground">{course.title}</h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              Bạn đang nắm phiên bản <strong className="font-medium text-foreground">v{knownVersion(enrollment)}</strong> → phiên bản hiện tại{" "}
              <strong className="font-medium text-foreground">v{course.currentVersion}</strong>
            </p>
            {pending?.dueDate && (
              <p className={cn("mt-2 flex items-center gap-2 text-[15px]", pending.overdue ? "text-destructive" : "text-warning")}>
                <CalendarClock className="size-4" />
                Hạn xác nhận: {formatDate(pending.dueDate)}
                {pending.overdue && <StatusBadge tone="destructive">Quá hạn</StatusBadge>}
              </p>
            )}
          </div>
        </div>
      </section>

      {!pending ? (
        <section className="flex flex-col items-center gap-3 rounded-md bg-card px-6 py-12 text-center shadow-md">
          <span className="flex size-16 items-center justify-center rounded-full bg-success/16 text-success">
            <CheckCircle2 className="size-8" />
          </span>
          <p className="text-lg font-medium text-foreground">Bạn đã nắm phiên bản mới nhất</p>
          <p className="text-[15px] text-muted-foreground">
            {enrollment.acknowledgedAt ? `Xác nhận lần gần nhất ngày ${formatDate(enrollment.acknowledgedAt)}.` : "Không có cập nhật nào cần xác nhận."}
          </p>
          <Link href={`/my-courses/${course.id}`} className={buttonVariants({ variant: "secondary" })}>
            Về trang khoá học
          </Link>
        </section>
      ) : (
        <>
          {pending.updates.map((u) => (
            <article key={u.versionNo} className="rounded-md bg-card p-6 shadow-md">
              <header className="mb-4 flex flex-wrap items-center gap-3 border-b border-border pb-3">
                <StatusBadge tone="info">v{u.versionNo} · MINOR</StatusBadge>
                <span className="text-[13px] text-muted-foreground">Phát hành ngày {formatDate(u.publishedAt)}</span>
              </header>
              {u.summaryHtml ? (
                <LessonContent html={u.summaryHtml} />
              ) : (
                <p className="text-[15px] text-muted-foreground italic">Không có tóm tắt.</p>
              )}
            </article>
          ))}

          <section className="flex flex-wrap items-center justify-between gap-4 rounded-md bg-card p-6 shadow-md">
            <Link href={`/my-courses/${course.id}`} className={buttonVariants({ variant: "outline" })}>
              <BookOpen />
              Xem lại nội dung khoá
            </Link>
            <AckButton courseId={course.id} />
          </section>
        </>
      )}
    </div>
  );
}
