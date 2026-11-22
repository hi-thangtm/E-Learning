import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Khoá theo lộ trình (Việc 23B — docs/database.md Quy tắc 3). Chỉ chạy ở server.
 * Lượt học có `learningPathId` bị 🔒 khi còn khoá ĐỨNG TRƯỚC trong lộ trình mà người đó có lượt học (khác CANCELLED)
 * nhưng chưa COMPLETED. Khoá đứng trước mà người đó không có lượt học (VD khoá lưu trữ nên không được giao) -> bỏ qua.
 * Lượt học không có `learningPathId` -> không bị ảnh hưởng.
 */

export type PathLock = {
  pathId: string;
  pathTitle: string;
  /** Khoá đầu tiên đứng trước chưa xong — cần học trước */
  blockedBy: { id: string; title: string };
};

export type PathLockItem = { userId: string; courseId: string; learningPathId: string | null };

type Db = Prisma.TransactionClient;

export const lockKey = (userId: string, courseId: string) => `${userId}:${courseId}`;

/** Khoá của các lộ trình (theo thứ tự). */
export async function loadPathCourses(pathIds: string[], db: Db = prisma) {
  if (pathIds.length === 0) return new Map<string, { id: string; title: string; courses: { id: string; title: string }[] }>();
  const paths = await db.learningPath.findMany({
    where: { id: { in: pathIds } },
    select: {
      id: true,
      title: true,
      courses: { orderBy: { sortOrder: "asc" }, select: { course: { select: { id: true, title: true } } } },
    },
  });
  return new Map(paths.map((p) => [p.id, { id: p.id, title: p.title, courses: p.courses.map((c) => c.course) }]));
}

/** Tính khoá cho nhiều lượt học cùng lúc (2–3 truy vấn, không N+1). Trả Map theo `lockKey(userId, courseId)`; không có = không 🔒. */
export async function getPathLocks(items: PathLockItem[], db: Db = prisma): Promise<Map<string, PathLock>> {
  const result = new Map<string, PathLock>();
  const withPath = items.filter((i): i is PathLockItem & { learningPathId: string } => !!i.learningPathId);
  if (withPath.length === 0) return result;

  const paths = await loadPathCourses([...new Set(withPath.map((i) => i.learningPathId))], db);
  const courseIds = [...new Set([...paths.values()].flatMap((p) => p.courses.map((c) => c.id)))];
  const enrollments = await db.enrollment.findMany({
    where: { userId: { in: [...new Set(withPath.map((i) => i.userId))] }, courseId: { in: courseIds }, status: { not: "CANCELLED" } },
    select: { userId: true, courseId: true, status: true },
  });
  const statusOf = new Map(enrollments.map((e) => [lockKey(e.userId, e.courseId), e.status]));

  for (const item of withPath) {
    const path = paths.get(item.learningPathId);
    if (!path) continue;
    const index = path.courses.findIndex((c) => c.id === item.courseId);
    for (let j = 0; j < index; j++) {
      const before = path.courses[j];
      const status = statusOf.get(lockKey(item.userId, before.id));
      if (status && status !== "COMPLETED") {
        result.set(lockKey(item.userId, item.courseId), { pathId: path.id, pathTitle: path.title, blockedBy: before });
        break;
      }
    }
  }
  return result;
}

/** Khoá theo lộ trình của 1 khoá với 1 người (lượt học khác CANCELLED). null = không bị khoá. */
export async function getPathLock(userId: string, courseId: string): Promise<PathLock | null> {
  const enrollment = await prisma.enrollment.findFirst({
    where: { userId, courseId, status: { not: "CANCELLED" } },
    select: { learningPathId: true },
  });
  if (!enrollment?.learningPathId) return null;
  const locks = await getPathLocks([{ userId, courseId, learningPathId: enrollment.learningPathId }]);
  return locks.get(lockKey(userId, courseId)) ?? null;
}
