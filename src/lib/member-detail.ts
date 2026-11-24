import "server-only";
import { prisma } from "@/lib/db";

/**
 * Lượt học của 1 người (bảng “Khoá học” ở /team/members/[id] và /org/users/[id] — Việc 33 F1).
 * Người gọi PHẢI kiểm tra phạm vi trước (assertUserInTeam / findTargetInScope). Không gồm lượt đã huỷ.
 */

export type MemberEnrollmentRow = {
  id: string;
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  source: "RULE" | "ASSIGNED" | "SELF";
  progressPercent: number;
  dueDate: Date | null;
  completedAt: Date | null;
  acknowledgedVersion: number | null;
  course: { id: string; code: string; title: string; currentVersion: number };
  learningPath: { code: string; title: string } | null;
  /** Điểm cao nhất từng bài kiểm tra của khoá (lượt đã nộp) */
  scores: { title: string; score: number }[];
};

export async function getMemberEnrollments(userId: string): Promise<MemberEnrollmentRow[]> {
  const [enrollments, attempts] = await Promise.all([
    prisma.enrollment.findMany({
      where: { userId, status: { not: "CANCELLED" } },
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
      select: {
        id: true,
        status: true,
        source: true,
        progressPercent: true,
        dueDate: true,
        completedAt: true,
        acknowledgedVersion: true,
        course: { select: { id: true, code: true, title: true, currentVersion: true } },
        learningPath: { select: { code: true, title: true } },
      },
    }),
    prisma.quizAttempt.groupBy({ by: ["lessonId"], where: { userId, submittedAt: { not: null } }, _max: { score: true } }),
  ]);

  const lessons = attempts.length
    ? await prisma.lesson.findMany({
        where: { id: { in: attempts.map((a) => a.lessonId) } },
        select: { id: true, title: true, section: { select: { courseId: true } } },
      })
    : [];
  const lessonOf = new Map(lessons.map((l) => [l.id, l]));
  const scoresByCourse = new Map<string, { title: string; score: number }[]>();
  for (const a of attempts) {
    const l = lessonOf.get(a.lessonId);
    if (!l || a._max.score === null) continue;
    const list = scoresByCourse.get(l.section.courseId) ?? [];
    list.push({ title: l.title, score: a._max.score });
    scoresByCourse.set(l.section.courseId, list);
  }

  return enrollments.map((e) => ({ ...e, scores: scoresByCourse.get(e.course.id) ?? [] }));
}
