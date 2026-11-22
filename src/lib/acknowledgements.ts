import "server-only";
import { prisma } from "@/lib/db";
import { addDaysIso, vnDayEnd, vnIsoDate } from "@/lib/format";
import { sanitizeLessonHtml } from "@/lib/sanitize";

/**
 * Phiên bản mới — phía học viên (Việc 21B). CHỈ chạy ở server. docs/database.md — Quy tắc 2.
 * - MINOR: người đã học xong đọc tóm tắt thay đổi rồi bấm "Tôi đã đọc và nắm được" → acknowledgedVersion = currentVersion.
 * - "Đã nắm quy trình mới nhất" = acknowledgedVersion = courses.currentVersion.
 * - Không ghi audit_logs cho việc xác nhận (đã có acknowledgedAt).
 */

export type MinorUpdate = { versionNo: number; publishedAt: Date; summaryHtml: string };

export type PendingAcknowledgement = {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  /** Phiên bản người học đang nắm */
  acknowledgedVersion: number;
  currentVersion: number;
  /** Các bản MINOR cần đọc, mới nhất trước */
  updates: MinorUpdate[];
  /** Hạn xác nhận = cuối ngày (giờ VN) publishedAt + dueInDays của bản MINOR mới nhất; null = không đặt hạn */
  dueDate: Date | null;
  overdue: boolean;
};

/** Phiên bản đã nắm (cũ chưa có acknowledgedVersion -> lấy completedVersion). */
export function knownVersion(e: { acknowledgedVersion: number | null; completedVersion: number | null }): number {
  return e.acknowledgedVersion ?? e.completedVersion ?? 0;
}

/** Hạn xác nhận của 1 bản MINOR. */
export function ackDueDate(publishedAt: Date | null, dueInDays: number | null): Date | null {
  if (!publishedAt || !dueInDays) return null;
  return vnDayEnd(addDaysIso(vnIsoDate(publishedAt), dueInDays));
}

/** Các khoá người học đã học xong nhưng chưa xác nhận bản MINOR mới (lọc theo 1 khoá nếu truyền courseId). */
export async function getPendingAcknowledgements(userId: string, courseId?: string): Promise<PendingAcknowledgement[]> {
  const enrollments = await prisma.enrollment.findMany({
    where: { userId, status: "COMPLETED", ...(courseId && { courseId }), course: { currentVersion: { gte: 2 } } },
    select: {
      id: true,
      acknowledgedVersion: true,
      completedVersion: true,
      course: { select: { id: true, title: true, currentVersion: true } },
    },
  });
  const behind = enrollments.filter((e) => knownVersion(e) < e.course.currentVersion);
  if (behind.length === 0) return [];

  const versions = await prisma.courseVersion.findMany({
    where: { courseId: { in: behind.map((e) => e.course.id) }, status: "PUBLISHED", changeType: "MINOR" },
    orderBy: { versionNo: "desc" },
    select: { courseId: true, versionNo: true, publishedAt: true, dueInDays: true, changeSummary: true },
  });

  const now = new Date();
  return behind.flatMap((e) => {
    const known = knownVersion(e);
    const mine = versions.filter(
      (v) => v.courseId === e.course.id && v.versionNo !== null && v.versionNo > known && v.versionNo <= e.course.currentVersion,
    );
    if (mine.length === 0) return [];
    const latest = mine[0];
    const dueDate = ackDueDate(latest.publishedAt, latest.dueInDays);
    return [
      {
        enrollmentId: e.id,
        courseId: e.course.id,
        courseTitle: e.course.title,
        acknowledgedVersion: known,
        currentVersion: e.course.currentVersion,
        updates: mine.map((v) => ({
          versionNo: v.versionNo!,
          publishedAt: v.publishedAt ?? now,
          // Đã lọc khi lưu — lọc lại lần nữa trước khi đưa ra trình duyệt
          summaryHtml: sanitizeLessonHtml(v.changeSummary ?? ""),
        })),
        dueDate,
        overdue: !!dueDate && dueDate < now,
      },
    ];
  });
}

/**
 * "Tôi đã đọc và nắm được": chỉ lượt học của CHÍNH người dùng, đã học xong, đang có bản cần xác nhận.
 * Đánh dấu đã đọc các thông báo VERSION_MINOR của khoá đó.
 */
export async function acknowledgeVersion(
  userId: string,
  courseId: string,
): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  const [pending] = await getPendingAcknowledgements(userId, courseId);
  if (!pending) return { ok: false, message: "Không có cập nhật nào cần xác nhận cho khoá này." };

  const now = new Date();
  await prisma.$transaction([
    prisma.enrollment.updateMany({
      where: { id: pending.enrollmentId, userId, status: "COMPLETED" },
      data: { acknowledgedVersion: pending.currentVersion, acknowledgedAt: now },
    }),
    prisma.notification.updateMany({
      where: { userId, type: "VERSION_MINOR", readAt: null, link: { startsWith: `/my-courses/${courseId}` } },
      data: { readAt: now },
    }),
  ]);
  return { ok: true, version: pending.currentVersion };
}

export type VersionNote =
  | { kind: "current"; version: number; acknowledgedAt: Date | null }
  | { kind: "major"; versionNo: number; summaryHtml: string }
  | null;

/**
 * Ghi chú phiên bản ở trang giới thiệu khoá:
 * - đã học xong và nắm bản hiện tại → "Bạn đã nắm phiên bản vX";
 * - lượt học bị đặt lại do bản MAJOR (từng học xong bản cũ, chưa học xong lại) → tóm tắt bản MAJOR.
 */
export async function getVersionNote(
  courseId: string,
  enrollment: {
    status: string;
    completedVersion: number | null;
    acknowledgedVersion: number | null;
    acknowledgedAt: Date | null;
  },
  currentVersion: number,
): Promise<VersionNote> {
  if (currentVersion < 1) return null;
  if (enrollment.status === "COMPLETED") {
    const known = knownVersion(enrollment);
    return known >= currentVersion ? { kind: "current", version: known, acknowledgedAt: enrollment.acknowledgedAt } : null;
  }
  if (enrollment.completedVersion === null) return null;
  const major = await prisma.courseVersion.findFirst({
    where: {
      courseId,
      status: "PUBLISHED",
      changeType: "MAJOR",
      versionNo: { gt: enrollment.completedVersion, lte: currentVersion },
    },
    orderBy: { versionNo: "desc" },
    select: { versionNo: true, changeSummary: true },
  });
  return major?.versionNo ? { kind: "major", versionNo: major.versionNo, summaryHtml: sanitizeLessonHtml(major.changeSummary ?? "") } : null;
}
