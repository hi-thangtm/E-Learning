import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { safeLink, type NotificationType, type NotificationView } from "@/lib/notification-types";

/**
 * Thông báo (chuông) — CHỈ chạy ở server. docs/database.md — Quy tắc 6.
 * - Ghi: notify() — tạo hàng loạt, bỏ qua trùng (userId + dedupeKey).
 * - Đọc / đánh dấu: mọi hàm chỉ đụng thông báo của CHÍNH userId truyền vào.
 * - Không ghi audit_logs cho thông báo.
 */

export const NOTIFICATIONS_PAGE_SIZE = 20;

type NotifyDb = { notification: Prisma.TransactionClient["notification"] };

export type NotifyInput = {
  userIds: string[];
  type: NotificationType;
  title: string;
  /** Link nội bộ, phải bắt đầu bằng "/" — sai thì bỏ link */
  link?: string | null;
  /** Chống gửi trùng: `<LOẠI>:<đối tượng>[:<mốc>]`. Cùng người + cùng key chỉ tạo 1 lần. */
  dedupeKey?: string | null;
};

/**
 * Tạo thông báo cho nhiều người. Trả PrismaPromise nên dùng được trong `prisma.$transaction([...])`
 * lẫn `await notify(tx, …)` trong transaction dạng hàm.
 */
export function notify(db: NotifyDb, input: NotifyInput) {
  const link = safeLink(input.link);
  const title = input.title.trim().slice(0, 300);
  const dedupeKey = input.dedupeKey?.slice(0, 200) || null;
  const userIds = [...new Set(input.userIds)];

  // Giai đoạn 2 — Lark: sau khi tạo, gửi tin nhắn Lark cho người có users.larkUserId rồi đánh dấu sentToLarkAt
  // (tác vụ nền đọc các dòng sentToLarkAt IS NULL — không gửi trong transaction nghiệp vụ).

  return db.notification.createMany({
    data: userIds.map((userId) => ({ userId, type: input.type, title, link, dedupeKey })),
    skipDuplicates: true,
  });
}

// ---------------------------------------------------------------------------------------------
// Đọc

const VIEW_SELECT = { id: true, type: true, title: true, link: true, readAt: true, createdAt: true } as const;

function toView(n: { id: string; type: string; title: string; link: string | null; readAt: Date | null; createdAt: Date }): NotificationView {
  return { id: n.id, type: n.type, title: n.title, link: safeLink(n.link), read: !!n.readAt, createdAt: n.createdAt.toISOString() };
}

export function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

export async function getLatest(userId: string, take = 10): Promise<NotificationView[]> {
  const rows = await prisma.notification.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
    select: VIEW_SELECT,
  });
  return rows.map(toView);
}

export type NotificationTab = "all" | "unread";

export async function listNotifications(
  userId: string,
  options: { tab: NotificationTab; type?: string; page: number },
): Promise<{ rows: NotificationView[]; total: number; all: number; unread: number }> {
  const where: Prisma.NotificationWhereInput = {
    userId,
    ...(options.tab === "unread" && { readAt: null }),
    ...(options.type && { type: options.type }),
  };
  const typeWhere: Prisma.NotificationWhereInput = { userId, ...(options.type && { type: options.type }) };
  const [rows, total, all, unread] = await prisma.$transaction([
    prisma.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (options.page - 1) * NOTIFICATIONS_PAGE_SIZE,
      take: NOTIFICATIONS_PAGE_SIZE,
      select: VIEW_SELECT,
    }),
    prisma.notification.count({ where }),
    prisma.notification.count({ where: typeWhere }),
    prisma.notification.count({ where: { ...typeWhere, readAt: null } }),
  ]);
  return { rows: rows.map(toView), total, all, unread };
}

// ---------------------------------------------------------------------------------------------
// Đánh dấu đã đọc

/** Đánh dấu 1 thông báo của chính người dùng. Trả link (null nếu không có / không phải của người này). */
export async function markRead(userId: string, id: string): Promise<{ found: boolean; link: string | null }> {
  const n = await prisma.notification.findFirst({ where: { id, userId }, select: { link: true, readAt: true } });
  if (!n) return { found: false, link: null };
  if (!n.readAt) await prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
  return { found: true, link: safeLink(n.link) };
}

export async function markAllRead(userId: string): Promise<number> {
  const r = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
  return r.count;
}
