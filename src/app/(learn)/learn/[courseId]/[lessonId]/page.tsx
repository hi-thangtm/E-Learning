import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LessonBody } from "@/components/learning/lesson-body";
import { LessonShell } from "@/components/learning/lesson-shell";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getLessonAccess, getLessonDetail, getLessonProgress, startLearning } from "@/lib/learning";
import { autoSubmitExpired, getQuizOverview } from "@/lib/quiz";
import { getMyReview } from "@/lib/reviews";

export const metadata: Metadata = { title: "Học bài" };

/**
 * Trang học (feature-spec 2.4). Kiểm tra ở server: có lượt học (khác CANCELLED), bài thuộc khoá + chưa ẩn,
 * không bị khoá tuần tự — sai → về trang giới thiệu khoá. Mở bài = bắt đầu học (startLearning).
 */
export default async function LearnLessonPage({ params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const user = await requireUser();
  const { courseId, lessonId } = await params;

  const access = await getLessonAccess(user.id, courseId, lessonId);
  if (!access.ok) {
    redirect(
      access.reason === "enrollment"
        ? "/my-courses"
        : access.reason === "path"
          ? `/learning-paths/${access.pathId}` // Khoá 🔒 theo lộ trình
          : `/my-courses/${courseId}`,
    );
  }

  const [course, lesson, myReview] = await Promise.all([
    prisma.course.findUniqueOrThrow({ where: { id: courseId }, select: { id: true, title: true } }),
    getLessonDetail(lessonId),
    getMyReview(user.id, courseId),
  ]);
  if (!lesson) redirect(`/my-courses/${courseId}`);

  await startLearning(user.id, access.enrollment.id, access.lesson);
  const progress = lesson.type === "VIDEO" ? await getLessonProgress(user.id, lessonId) : null;

  // Bài kiểm tra: chấm các lượt dở đã hết giờ (đóng tab giữa chừng) rồi lấy tổng quan lượt làm
  let quiz = null;
  if (lesson.type === "QUIZ") {
    await autoSubmitExpired(user.id, lessonId);
    quiz = await getQuizOverview(user.id, lessonId);
  }

  const lessonHrefs = Object.fromEntries(
    access.outline.sections.flatMap((s) => s.lessons).map((l) => [l.id, `/learn/${courseId}/${l.id}`]),
  );

  return (
    <LessonShell
      key={lessonId}
      mode="learn"
      course={course}
      sections={access.outline.sections}
      progressPercent={access.outline.progressPercent}
      currentLessonId={lessonId}
      lessonHrefs={lessonHrefs}
      backHref={`/my-courses/${courseId}`}
      backLabel="Giới thiệu khoá"
      myReview={myReview && { rating: myReview.rating, comment: myReview.comment }}
    >
      <LessonBody
        lesson={lesson}
        videoProgress={{
          lastPositionSeconds: progress?.lastPositionSeconds ?? 0,
          maxWatchedSeconds: progress?.maxWatchedSeconds ?? 0,
        }}
        quiz={quiz}
      />
    </LessonShell>
  );
}
