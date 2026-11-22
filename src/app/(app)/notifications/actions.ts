"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/current-user";
import type { NotificationView } from "@/lib/notification-types";
import { getLatest, getUnreadCount, markAllRead, markRead } from "@/lib/notifications";

/** Thông báo của CHÍNH người đang đăng nhập (mọi vai trò). Không ghi audit_logs. */

const idSchema = z.string().trim().min(1).max(50);

export async function getLatestNotificationsAction(): Promise<{ items: NotificationView[]; unread: number }> {
  const user = await requireUser();
  const [items, unread] = await Promise.all([getLatest(user.id, 10), getUnreadCount(user.id)]);
  return { items, unread };
}

export async function markNotificationReadAction(
  id: string,
): Promise<{ ok: boolean; link: string | null; unread: number }> {
  const user = await requireUser();
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return { ok: false, link: null, unread: await getUnreadCount(user.id) };
  const r = await markRead(user.id, parsed.data);
  revalidatePath("/notifications");
  return { ok: r.found, link: r.link, unread: await getUnreadCount(user.id) };
}

export async function markAllNotificationsReadAction(): Promise<{ ok: true; count: number }> {
  const user = await requireUser();
  const count = await markAllRead(user.id);
  revalidatePath("/notifications");
  return { ok: true, count };
}
