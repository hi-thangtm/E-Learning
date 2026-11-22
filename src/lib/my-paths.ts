import "server-only";
import type { EnrollmentStatus } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Lộ trình của CHÍNH người đăng nhập (Việc 23B). Chỉ chạy ở server.
 * Lộ trình được giao = có lượt học (khác CANCELLED) gắn `learningPathId`. Các khoá tính vào lộ trình = khoá của lộ trình
 * mà người đó có lượt học (khác CANCELLED), theo thứ tự lộ trình — cùng cách tính với src/lib/path-lock.ts.
 */

export type PathStepState = "completed" | "open" | "locked";

export type PathStep = {
  course: { id: string; code: string; title: string; thumbnailUrl: string | null; categoryId: string | null };
  status: EnrollmentStatus;
  progressPercent: number;
  dueDate: Date | null;
  state: PathStepState;
  /** Khoá cần học trước (state = locked) */
  blockedBy: { id: string; title: string } | null;
};

export type MyPath = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  steps: PathStep[];
  completedCount: number;
  totalCount: number;
  percent: number;
  /** Hạn chung = hạn muộn nhất của các khoá */
  dueDate: Date | null;
  completed: boolean;
  overdue: boolean;
};

async function buildPaths(userId: string, pathIds: string[]): Promise<MyPath[]> {
  if (pathIds.length === 0) return [];
  const paths = await prisma.learningPath.findMany({
    where: { id: { in: pathIds } },
    select: {
      id: true,
      code: true,
      title: true,
      description: true,
      courses: {
        orderBy: { sortOrder: "asc" },
        select: { course: { select: { id: true, code: true, title: true, thumbnailUrl: true, categoryId: true } } },
      },
    },
  });
  const courseIds = [...new Set(paths.flatMap((p) => p.courses.map((c) => c.course.id)))];
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, courseId: { in: courseIds }, status: { not: "CANCELLED" } },
    select: { courseId: true, status: true, progressPercent: true, dueDate: true },
  });
  const enrollmentOf = new Map(enrollments.map((e) => [e.courseId, e]));
  const now = new Date();

  const result = paths.map((p): MyPath => {
    let firstOpen: { id: string; title: string } | null = null;
    const steps: PathStep[] = [];
    for (const { course } of p.courses) {
      const e = enrollmentOf.get(course.id);
      if (!e) continue;
      const done = e.status === "COMPLETED";
      const state: PathStepState = done ? "completed" : firstOpen ? "locked" : "open";
      steps.push({
        course,
        status: e.status,
        progressPercent: e.progressPercent,
        dueDate: e.dueDate,
        state,
        blockedBy: state === "locked" ? firstOpen : null,
      });
      if (!done && !firstOpen) firstOpen = { id: course.id, title: course.title };
    }
    const completedCount = steps.filter((s) => s.state === "completed").length;
    const dues = steps.map((s) => s.dueDate).filter((d): d is Date => !!d);
    const dueDate = dues.length ? new Date(Math.max(...dues.map((d) => d.getTime()))) : null;
    const completed = steps.length > 0 && completedCount === steps.length;
    return {
      id: p.id,
      code: p.code,
      title: p.title,
      description: p.description,
      steps,
      completedCount,
      totalCount: steps.length,
      percent: steps.length ? Math.round((completedCount / steps.length) * 100) : 0,
      dueDate,
      completed,
      overdue: !completed && !!dueDate && dueDate < now,
    };
  });
  // Đang học trước, hoàn thành sau; cùng nhóm: hạn gần trước
  return result.sort(
    (a, b) =>
      Number(a.completed) - Number(b.completed) ||
      (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity) ||
      a.title.localeCompare(b.title, "vi"),
  );
}

/** Các lộ trình được giao cho tôi. */
export async function getMyPaths(userId: string): Promise<MyPath[]> {
  const rows = await prisma.enrollment.findMany({
    where: { userId, status: { not: "CANCELLED" }, learningPathId: { not: null } },
    select: { learningPathId: true },
    distinct: ["learningPathId"],
  });
  return buildPaths(
    userId,
    rows.map((r) => r.learningPathId!),
  );
}

/** 1 lộ trình của tôi — null nếu tôi không có lượt học nào thuộc lộ trình này. */
export async function getMyPath(userId: string, pathId: string): Promise<MyPath | null> {
  if (!pathId || pathId.length > 50) return null;
  const has = await prisma.enrollment.findFirst({
    where: { userId, learningPathId: pathId, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (!has) return null;
  const [path] = await buildPaths(userId, [pathId]);
  return path ?? null;
}
