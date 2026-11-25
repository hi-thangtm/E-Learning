"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isLarkConfigured } from "@/lib/lark/client";
import { buildLarkCard, classifyLarkError, kickLarkDispatch, sendLarkCard } from "@/lib/lark/notify";
import { saveLarkNotifySettings } from "@/lib/lark/notify-settings";
import { NOTIFICATION_TYPE_KEYS, type NotificationType } from "@/lib/notification-types";
import { LIMITS, RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";

/** Gửi thông báo qua Lark (Việc L2) — CHỈ Admin tập đoàn. Mọi thao tác ghi audit_logs. */

const PATH = "/system/lark";
type Result = { ok: true; message: string } | { ok: false; message: string };

const settingsSchema = z.object({
  enabled: z.boolean(),
  types: z.array(z.enum(NOTIFICATION_TYPE_KEYS as [NotificationType, ...NotificationType[]]), { error: "Loại thông báo không hợp lệ." }).max(50),
});

export async function saveLarkNotifySettingsAction(input: { enabled: boolean; types: string[] }): Promise<Result> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const parsed = settingsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  if (parsed.data.enabled && !(await isLarkConfigured())) return { ok: false, message: "Chưa cấu hình kết nối Lark — nhập App ID / App Secret trước." };

  const { before, after } = await saveLarkNotifySettings(parsed.data);
  await logAudit(prisma, {
    actorId: actor.id,
    companyId: actor.companyId,
    action: "LARK_NOTIFY_SETTINGS_UPDATED",
    entityType: "System",
    metadata: { enabled: after.enabled, types: after.types, before: { enabled: before.enabled, types: before.types } },
  });
  revalidatePath(PATH);
  return { ok: true, message: after.enabled ? "Đã lưu — thông báo mới sẽ được gửi qua Lark." : "Đã lưu — đã tắt gửi qua Lark." };
}

/** Gửi 1 thẻ thử tới chính Admin (cần tài khoản đã liên kết Lark). */
export async function sendLarkTestAction(): Promise<Result> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`lark-notify-test:${actor.id}`, LIMITS.larkTest).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };
  if (!(await isLarkConfigured())) return { ok: false, message: "Chưa cấu hình kết nối Lark." };
  const me = await prisma.user.findUniqueOrThrow({ where: { id: actor.id }, select: { larkUserId: true } });
  if (!me.larkUserId) return { ok: false, message: "Tài khoản của bạn chưa liên kết Lark (chưa có trong lần đồng bộ danh bạ) — không có chỗ nhận tin." };

  let outcome: Result;
  try {
    await sendLarkCard(
      me.larkUserId,
      buildLarkCard({ type: "REMINDER", title: "Tin nhắn thử từ E-Learning — kết nối Lark hoạt động bình thường.", link: "/notifications", createdAt: new Date() }),
    );
    outcome = { ok: true, message: "Đã gửi tin nhắn thử — kiểm tra Lark của bạn." };
  } catch (error) {
    outcome = { ok: false, message: `Gửi thử lỗi: ${classifyLarkError(error).reason}` };
  }
  await logAudit(prisma, {
    actorId: actor.id,
    companyId: actor.companyId,
    action: "LARK_NOTIFY_TESTED",
    entityType: "System",
    metadata: { ok: outcome.ok, ...(!outcome.ok && { reason: outcome.message.slice(0, 300) }) },
  });
  return outcome;
}

/** Tin gửi lỗi → chờ gửi lại ngay (đặt lại số lần thử). */
export async function retryFailedLarkAction(): Promise<Result> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const r = await prisma.notification.updateMany({
    where: { larkStatus: "FAILED" },
    data: { larkStatus: "PENDING", larkAttempts: 0, larkNextAttemptAt: new Date(), larkError: null },
  });
  await logAudit(prisma, { actorId: actor.id, companyId: actor.companyId, action: "LARK_NOTIFY_RETRIED", entityType: "System", metadata: { count: r.count } });
  kickLarkDispatch();
  revalidatePath(PATH);
  return { ok: true, message: r.count > 0 ? `Đã xếp ${r.count} tin vào hàng gửi lại.` : "Không có tin lỗi nào." };
}
