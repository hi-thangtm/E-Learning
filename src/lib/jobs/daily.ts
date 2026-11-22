import "server-only";
import { ackDueDate, knownVersion } from "@/lib/acknowledgements";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { addDaysIso, dueAfterDays, formatDate, vnDayEnd, vnIsoDate } from "@/lib/format";
import { resetEnrollmentForRelearn } from "@/lib/learning";
import { notify } from "@/lib/notifications";
import { getPathLocks, lockKey } from "@/lib/path-lock";
import { gradeAttempt, QUIZ_GRACE_SECONDS } from "@/lib/quiz";
import { getSetting, getSettings } from "@/lib/settings";

/**
 * Tác vụ hằng ngày (feature-spec mục 7, docs/database.md — Quy tắc 6). CHỈ chạy ở server.
 * Gọi từ: route POST /api/jobs/daily (cron, có CRON_SECRET), `npm run job:daily` (máy dev), trang /system/jobs ("Chạy ngay").
 *
 * - Mỗi lúc chỉ 1 lượt chạy (khoá advisory của Postgres).
 * - Mỗi phần chạy riêng: 1 phần lỗi không làm hỏng phần khác (lỗi ghi vào kết quả + nhật ký).
 * - Duyệt theo lô 500 bản ghi. Ngày giờ theo Asia/Ho_Chi_Minh.
 * - Thông báo có dedupeKey → chạy lại nhiều lần trong ngày không gửi trùng.
 */

const BATCH = 500;
/** Mã khoá advisory riêng của tác vụ này (số bất kỳ, cố định). */
const LOCK_KEY = 20_260_020;
const DAY_MS = 86_400_000;

export type DailyJobTrigger = "manual" | "cron" | "script";

export type DailyJobCounts = {
  dueSoon: number;
  overdue: number;
  quizGraded: number;
  certExpiring: number;
  certExpiredReset: number;
  notificationsDeleted: number;
  ackOverdue: number;
};

export const DAILY_JOB_PARTS: { key: keyof DailyJobCounts; label: string }[] = [
  { key: "dueSoon", label: "Nhắc sắp đến hạn" },
  { key: "overdue", label: "Nhắc quá hạn" },
  { key: "quizGraded", label: "Chấm bài kiểm tra bỏ dở" },
  { key: "certExpiring", label: "Chứng nhận sắp hết hạn" },
  { key: "certExpiredReset", label: "Chứng nhận hết hạn → học lại" },
  { key: "notificationsDeleted", label: "Dọn thông báo cũ" },
  { key: "ackOverdue", label: "Nhắc xác nhận cập nhật quá hạn" },
];

export type DailyJobResult =
  | { ok: true; counts: DailyJobCounts; errors: Partial<Record<keyof DailyJobCounts, string>>; durationMs: number }
  | { ok: false; message: string };

// ---------------------------------------------------------------------------------------------
// Tiện ích

/** Duyệt theo lô bằng con trỏ id (không tải hết vào RAM). */
async function forEachBatch<T extends { id: string }>(
  fetchBatch: (cursor: string | undefined) => Promise<T[]>,
  handle: (rows: T[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await fetchBatch(cursor);
    if (rows.length === 0) return;
    await handle(rows);
    if (rows.length < BATCH) return;
    cursor = rows[rows.length - 1].id;
  }
}

/** Tham số phân trang theo con trỏ cho findMany. */
function page(cursor: string | undefined) {
  return { take: BATCH, orderBy: { id: "asc" as const }, ...(cursor && { cursor: { id: cursor }, skip: 1 }) };
}

/** Người nhận: đang làm + công ty đang hoạt động. */
const ACTIVE_LEARNER = { status: "ACTIVE" as const, company: { isActive: true } };

/** Bỏ lượt học đang 🔒 theo lộ trình (chưa học được thì không nhắc hạn) — Việc 23B. */
async function withoutPathLocked<T extends { userId: string; courseId: string; learningPathId: string | null }>(rows: T[]): Promise<T[]> {
  const locks = await getPathLocks(rows);
  return rows.filter((r) => !locks.has(lockKey(r.userId, r.courseId)));
}

/** Số ngày giữa 2 ngày yyyy-MM-dd (b − a). */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

// ---------------------------------------------------------------------------------------------
// Các phần

/** a. Sắp đến hạn: hạn từ bây giờ tới hết ngày (hôm nay + DUE_SOON_DAYS) giờ VN. */
async function remindDueSoon(now: Date): Promise<number> {
  const until = vnDayEnd(addDaysIso(vnIsoDate(now), await getSetting("DUE_SOON_DAYS")));
  let created = 0;
  await forEachBatch(
    (cursor) =>
      prisma.enrollment.findMany({
        where: {
          status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
          dueDate: { gte: now, lte: until },
          user: ACTIVE_LEARNER,
        },
        select: { id: true, userId: true, courseId: true, learningPathId: true, dueDate: true, course: { select: { title: true } } },
        ...page(cursor),
      }),
    async (batch) => {
      const rows = await withoutPathLocked(batch);
      const results = await prisma.$transaction(
        rows.map((e) =>
          notify(prisma, {
            userIds: [e.userId],
            type: "DUE_SOON",
            title: `Khoá “${e.course.title}” sẽ đến hạn ngày ${formatDate(e.dueDate)}`,
            link: `/my-courses/${e.courseId}`,
            dedupeKey: `due_soon:${e.id}:${vnIsoDate(e.dueDate!)}`,
          }),
        ),
      );
      created += results.reduce((sum, r) => sum + r.count, 0);
    },
  );
  return created;
}

/** b. Quá hạn: nhắc ngày đầu quá hạn, rồi nhắc lại mỗi OVERDUE_REMIND_INTERVAL_DAYS ngày (chu kỳ w). */
async function remindOverdue(now: Date): Promise<number> {
  const today = vnIsoDate(now);
  const interval = await getSetting("OVERDUE_REMIND_INTERVAL_DAYS");
  let created = 0;
  await forEachBatch(
    (cursor) =>
      prisma.enrollment.findMany({
        where: { status: { in: ["NOT_STARTED", "IN_PROGRESS"] }, dueDate: { lt: now }, user: ACTIVE_LEARNER },
        select: { id: true, userId: true, courseId: true, learningPathId: true, dueDate: true, course: { select: { title: true } } },
        ...page(cursor),
      }),
    async (batch) => {
      const rows = await withoutPathLocked(batch);
      const results = await prisma.$transaction(
        rows.map((e) => {
          const dueDay = vnIsoDate(e.dueDate!);
          const days = Math.max(1, daysBetween(dueDay, today));
          const week = Math.floor((days - 1) / interval);
          return notify(prisma, {
            userIds: [e.userId],
            type: "OVERDUE",
            title: `Khoá “${e.course.title}” đã quá hạn ${days} ngày`,
            link: `/my-courses/${e.courseId}`,
            dedupeKey: `overdue:${e.id}:${dueDay}:w${week}`,
          });
        }),
      );
      created += results.reduce((sum, r) => sum + r.count, 0);
    },
  );
  return created;
}

/** c. Bài kiểm tra bỏ dở đã quá giờ (+30 giây) → chấm theo bài đã lưu (đạt → hoàn thành bài). */
async function gradeAbandonedQuizzes(now: Date): Promise<number> {
  let graded = 0;
  await forEachBatch(
    (cursor) =>
      prisma.quizAttempt.findMany({
        where: { submittedAt: null, lesson: { timeLimitMinutes: { not: null } } },
        select: { id: true, startedAt: true, lesson: { select: { timeLimitMinutes: true } } },
        ...page(cursor),
      }),
    async (rows) => {
      for (const a of rows) {
        const expiresAt = a.startedAt.getTime() + (a.lesson.timeLimitMinutes ?? 0) * 60_000 + QUIZ_GRACE_SECONDS * 1000;
        if (expiresAt >= now.getTime()) continue;
        if (await gradeAttempt(a.id)) graded++;
      }
    },
  );
  return graded;
}

/** d. Chứng nhận sắp hết hạn trong CERT_EXPIRING_DAYS ngày tới. */
async function remindCertificatesExpiring(now: Date): Promise<number> {
  const until = new Date(now.getTime() + (await getSetting("CERT_EXPIRING_DAYS")) * DAY_MS);
  let created = 0;
  await forEachBatch(
    (cursor) =>
      prisma.certificate.findMany({
        where: { revokedAt: null, expiresAt: { gt: now, lte: until }, user: ACTIVE_LEARNER },
        select: { id: true, userId: true, courseTitle: true, expiresAt: true },
        ...page(cursor),
      }),
    async (rows) => {
      const results = await prisma.$transaction(
        rows.map((c) =>
          notify(prisma, {
            userIds: [c.userId],
            type: "CERTIFICATE_EXPIRING",
            title: `Chứng nhận khoá “${c.courseTitle}” sẽ hết hạn ngày ${formatDate(c.expiresAt)}`,
            link: "/certificates",
            dedupeKey: `cert_expiring:${c.id}`,
          }),
        ),
      );
      created += results.reduce((sum, r) => sum + r.count, 0);
    },
  );
  return created;
}

/**
 * e. Chứng nhận đã hết hạn → học lại: chỉ chứng nhận MỚI NHẤT của người đó cho khoá đó, và lượt học khoá đó đang COMPLETED.
 * Đặt lại lượt học (resetEnrollmentForRelearn) + thông báo trong 1 transaction. Chạy lại không làm lại (lượt học không còn COMPLETED).
 */
async function resetExpiredCertificates(now: Date): Promise<number> {
  const dueDays = await getSetting("DEFAULT_DUE_DAYS");
  let reset = 0;
  await forEachBatch(
    (cursor) =>
      prisma.certificate.findMany({
        where: { revokedAt: null, expiresAt: { lt: now }, courseId: { not: null }, user: ACTIVE_LEARNER },
        select: { id: true, userId: true, courseId: true, courseTitle: true, issuedAt: true },
        ...page(cursor),
      }),
    async (rows) => {
      for (const c of rows) {
        const courseId = c.courseId!;
        const newer = await prisma.certificate.findFirst({
          where: { userId: c.userId, courseId, issuedAt: { gt: c.issuedAt } },
          select: { id: true },
        });
        if (newer) continue;
        const enrollment = await prisma.enrollment.findUnique({
          where: { userId_courseId: { userId: c.userId, courseId } },
          select: { id: true, status: true },
        });
        if (!enrollment || enrollment.status !== "COMPLETED") continue;

        await prisma.$transaction(async (tx) => {
          await resetEnrollmentForRelearn(tx, enrollment.id, { dueDate: dueAfterDays(dueDays), reason: "CERTIFICATE_EXPIRED" });
          await notify(tx, {
            userIds: [c.userId],
            type: "CERTIFICATE_EXPIRING",
            title: `Chứng nhận khoá “${c.courseTitle}” đã hết hạn — vui lòng học lại`,
            link: `/my-courses/${courseId}`,
            dedupeKey: `cert_expired:${c.id}`,
          });
        });
        reset++;
      }
    },
  );
  return reset;
}

/**
 * g. Chưa xác nhận bản MINOR đã quá hạn (publishedAt + dueInDays của bản MINOR mới nhất) → nhắc ngày đầu quá hạn,
 * rồi mỗi OVERDUE_REMIND_INTERVAL_DAYS ngày (chu kỳ w trong dedupeKey).
 */
async function remindAckOverdue(now: Date): Promise<number> {
  const today = vnIsoDate(now);
  const interval = await getSetting("OVERDUE_REMIND_INTERVAL_DAYS");
  // Bản MINOR mới nhất của mỗi khoá (cache trong lượt chạy)
  const latestMinor = new Map<string, { versionNo: number; dueDate: Date | null } | null>();
  async function minorOf(courseId: string, currentVersion: number) {
    if (!latestMinor.has(courseId)) {
      const v = await prisma.courseVersion.findFirst({
        where: { courseId, status: "PUBLISHED", changeType: "MINOR", versionNo: { lte: currentVersion } },
        orderBy: { versionNo: "desc" },
        select: { versionNo: true, publishedAt: true, dueInDays: true },
      });
      latestMinor.set(courseId, v?.versionNo ? { versionNo: v.versionNo, dueDate: ackDueDate(v.publishedAt, v.dueInDays) } : null);
    }
    return latestMinor.get(courseId) ?? null;
  }

  let created = 0;
  await forEachBatch(
    (cursor) =>
      prisma.enrollment.findMany({
        where: { status: "COMPLETED", user: ACTIVE_LEARNER, course: { status: "PUBLISHED", currentVersion: { gte: 2 } } },
        select: {
          id: true,
          userId: true,
          acknowledgedVersion: true,
          completedVersion: true,
          course: { select: { id: true, title: true, currentVersion: true } },
        },
        ...page(cursor),
      }),
    async (rows) => {
      const ops = [];
      for (const e of rows) {
        const known = knownVersion(e);
        if (known >= e.course.currentVersion) continue;
        const minor = await minorOf(e.course.id, e.course.currentVersion);
        // Chỉ nhắc khi bản MINOR mới nhất là bản người này chưa nắm và đã quá hạn
        if (!minor || minor.versionNo <= known || !minor.dueDate || minor.dueDate >= now) continue;
        const days = Math.max(1, daysBetween(vnIsoDate(minor.dueDate), today));
        const week = Math.floor((days - 1) / interval);
        ops.push(
          notify(prisma, {
            userIds: [e.userId],
            type: "VERSION_MINOR",
            title: `Bạn chưa xác nhận cập nhật quy trình “${e.course.title}” (quá hạn)`,
            link: `/my-courses/${e.course.id}/updates`,
            dedupeKey: `ack_overdue:${e.id}:v${e.course.currentVersion}:w${week}`,
          }),
        );
      }
      if (ops.length === 0) return;
      const results = await prisma.$transaction(ops);
      created += results.reduce((sum, r) => sum + r.count, 0);
    },
  );
  return created;
}

/** f. Dọn thông báo: đã đọc quá NOTIFICATION_READ_RETENTION_DAYS, chưa đọc quá NOTIFICATION_UNREAD_RETENTION_DAYS ngày (Cài đặt). */
async function cleanupNotifications(now: Date): Promise<number> {
  const { NOTIFICATION_READ_RETENTION_DAYS: readDays, NOTIFICATION_UNREAD_RETENTION_DAYS: unreadDays } = await getSettings();
  const [read, unread] = await prisma.$transaction([
    prisma.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - readDays * DAY_MS) } } }),
    prisma.notification.deleteMany({ where: { readAt: null, createdAt: { lt: new Date(now.getTime() - unreadDays * DAY_MS) } } }),
  ]);
  return read.count + unread.count;
}

// ---------------------------------------------------------------------------------------------
// Chạy

export async function runDailyJob(options: { triggeredBy: string | null; trigger: DailyJobTrigger }): Promise<DailyJobResult> {
  const started = Date.now();

  // Khoá advisory theo transaction: giữ suốt lúc chạy, tự nhả khi transaction kết thúc
  // (Prisma dùng nhiều kết nối — khoá theo phiên có thể bị khoá / nhả trên 2 kết nối khác nhau).
  // Transaction này chỉ giữ khoá; phần việc chạy bằng prisma bình thường.
  const outcome = await prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}::bigint) AS locked`;
      if (!locked) return null;

      const now = new Date();
      const counts: DailyJobCounts = {
        dueSoon: 0,
        overdue: 0,
        quizGraded: 0,
        certExpiring: 0,
        certExpiredReset: 0,
        notificationsDeleted: 0,
        ackOverdue: 0,
      };
      const errors: Partial<Record<keyof DailyJobCounts, string>> = {};
      const parts: [keyof DailyJobCounts, (now: Date) => Promise<number>][] = [
        ["dueSoon", remindDueSoon],
        ["overdue", remindOverdue],
        ["quizGraded", gradeAbandonedQuizzes],
        ["certExpiring", remindCertificatesExpiring],
        ["certExpiredReset", resetExpiredCertificates],
        ["notificationsDeleted", cleanupNotifications],
        ["ackOverdue", remindAckOverdue],
      ];
      for (const [key, run] of parts) {
        try {
          counts[key] = await run(now);
        } catch (error) {
          errors[key] = errorText(error);
          console.error(`[daily-job] Phần ${key} lỗi:`, error);
        }
      }
      return { counts, errors };
    },
    { timeout: 15 * 60_000, maxWait: 10_000 },
  );

  if (!outcome) return { ok: false, message: "Đang có lượt chạy khác." };

  const durationMs = Date.now() - started;
  await logAudit(prisma, {
    actorId: options.triggeredBy,
    companyId: null,
    action: "JOB_DAILY_RUN",
    entityType: "System",
    metadata: { trigger: options.trigger, counts: outcome.counts, errors: outcome.errors, durationMs },
  });

  return { ok: true, counts: outcome.counts, errors: outcome.errors, durationMs };
}
