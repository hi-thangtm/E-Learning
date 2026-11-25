import "server-only";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getLarkClient, isLarkConfigured, larkCall, LarkApiError } from "@/lib/lark/client";
import { getLarkNotifySettings } from "@/lib/lark/notify-settings";
import { notificationMeta, safeLink } from "@/lib/notification-types";

/**
 * Gửi thông báo qua Lark (Việc L2) — CHỈ chạy ở server.
 *
 * - notify() (src/lib/notifications.ts) đánh dấu thông báo `larkStatus = PENDING`; bộ gửi ở đây đọc các dòng đó và gửi THẺ tin nhắn
 *   (bot của app Lark, `im/v1/messages`, receive_id_type = user_id = users.larkUserId) có nút “Mở trong E-Learning”.
 * - Chạy nền trong tiến trình app (src/instrumentation.ts): mỗi 10 giây + đánh thức ngay khi có thông báo mới (kickLarkDispatch).
 *   Tác vụ hằng ngày gọi thêm 1 lượt dự phòng.
 * - Nhận việc bằng "giữ chỗ" có điều kiện (đẩy larkNextAttemptAt tới mốc riêng) → 2 lượt chạy song song không gửi trùng.
 * - Bỏ qua (SKIPPED, chỉ hiện ở chuông): chưa liên kết Lark, tài khoản đã khoá, loại đang tắt, tạo trước mốc bật.
 * - Lỗi tạm (mạng, 5xx, bị giới hạn): thử lại sau 1 / 5 / 15 / 60 phút, tối đa 5 lần → FAILED. Lỗi cố định (người nhận ngoài phạm vi app,
 *   thiếu quyền) → FAILED ngay, admin bấm “Gửi lại tin lỗi” sau khi sửa.
 */

const BATCH = 100;
const CONCURRENCY = 5;
const PAUSE_MS = 250; // ~20 tin / giây (5 tin mỗi 250ms) — dưới giới hạn gửi tin của Lark
const LEASE_MS = 2 * 60_000;
export const LARK_MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MIN = [1, 5, 15, 60];

/** Mã lỗi Lark coi là cố định (thử lại cũng không được) → lý do tiếng Việt */
const PERMANENT_ERRORS: Record<number, string> = {
  230013: "Người nhận không nằm trong phạm vi sử dụng của app Lark (Availability).",
  230001: "Mã người nhận Lark không hợp lệ.",
  230006: "App Lark chưa bật tính năng Bot.",
  99991672: "App Lark thiếu quyền gửi tin nhắn (im:message:send_as_bot) hoặc chưa phát hành phiên bản mới.",
  99991679: "App Lark thiếu quyền gửi tin nhắn (im:message:send_as_bot).",
};

const HEADER_COLOR = { primary: "blue", info: "wathet", warning: "orange", destructive: "red", success: "green", secondary: "grey" } as const;

function appUrl(): string {
  return (process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000").replace(/\/+$/, "");
}

/** Thẻ tin nhắn Lark (card JSON). Dùng plain_text cho nội dung → không bị chèn markdown. */
export function buildLarkCard(n: { type: string; title: string; link: string | null; createdAt: Date }) {
  const meta = notificationMeta(n.type);
  const link = safeLink(n.link);
  return {
    config: { wide_screen_mode: true },
    header: { template: HEADER_COLOR[meta.tone as keyof typeof HEADER_COLOR] ?? "blue", title: { tag: "plain_text", content: meta.label } },
    elements: [
      { tag: "div", text: { tag: "plain_text", content: n.title } },
      ...(link
        ? [{ tag: "action", actions: [{ tag: "button", type: "primary", text: { tag: "plain_text", content: "Mở trong E-Learning" }, url: `${appUrl()}${link}` }] }]
        : []),
      { tag: "note", elements: [{ tag: "plain_text", content: `E-Learning · ${formatDateTime(n.createdAt)}` }] },
    ],
  };
}

/** Gửi 1 thẻ tới 1 người (user_id Lark). Ném LarkApiError khi lỗi. */
export async function sendLarkCard(larkUserId: string, card: object): Promise<void> {
  const client = await getLarkClient();
  await larkCall("gửi tin nhắn", () =>
    client.im.message.create({
      params: { receive_id_type: "user_id" },
      data: { receive_id: larkUserId, msg_type: "interactive", content: JSON.stringify(card) },
    }),
  );
}

/** Lỗi gửi → { permanent, reason } */
export function classifyLarkError(error: unknown): { permanent: boolean; reason: string } {
  if (error instanceof LarkApiError) {
    if (error.code !== null && PERMANENT_ERRORS[error.code]) return { permanent: true, reason: PERMANENT_ERRORS[error.code] };
    if (error.httpStatus !== null && error.httpStatus >= 400 && error.httpStatus < 500 && error.httpStatus !== 429) {
      return { permanent: true, reason: error.message.slice(0, 300) };
    }
    return { permanent: false, reason: error.message.slice(0, 300) };
  }
  return { permanent: false, reason: (error instanceof Error ? error.message : String(error)).slice(0, 300) };
}

export type LarkDispatchResult = { sent: number; skipped: number; failed: number; retrying: number };

/** 1 lượt gửi: lấy tới `limit` tin đến hạn. Lark chưa cấu hình → không làm gì (tin vẫn chờ). */
export async function dispatchLarkNotifications({ limit = 500 }: { limit?: number } = {}): Promise<LarkDispatchResult> {
  const result: LarkDispatchResult = { sent: 0, skipped: 0, failed: 0, retrying: 0 };
  if (!(await isLarkConfigured())) return result;
  const settings = await getLarkNotifySettings(true);
  const since = settings.since ? new Date(settings.since) : null;

  while (result.sent + result.skipped + result.failed + result.retrying < limit) {
    const now = new Date();
    const due = await prisma.notification.findMany({
      where: { larkStatus: "PENDING", larkNextAttemptAt: { lte: now } },
      orderBy: { createdAt: "asc" },
      take: Math.min(BATCH, limit),
      select: { id: true, larkNextAttemptAt: true },
    });
    if (due.length === 0) break;

    // Giữ chỗ: mỗi tin chỉ 1 lượt chạy nhận được (cập nhật có điều kiện đúng mốc cũ)
    const lease = new Date(now.getTime() + LEASE_MS);
    const claimed: string[] = [];
    for (const d of due) {
      const r = await prisma.notification.updateMany({
        where: { id: d.id, larkStatus: "PENDING", larkNextAttemptAt: d.larkNextAttemptAt },
        data: { larkNextAttemptAt: lease },
      });
      if (r.count === 1) claimed.push(d.id);
    }
    if (claimed.length === 0) break;

    const rows = await prisma.notification.findMany({
      where: { id: { in: claimed } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        type: true,
        title: true,
        link: true,
        createdAt: true,
        larkAttempts: true,
        user: { select: { larkUserId: true, status: true } },
      },
    });

    const skip = async (id: string, reason: string) => {
      await prisma.notification.update({ where: { id }, data: { larkStatus: "SKIPPED", larkNextAttemptAt: null, larkError: reason } });
      result.skipped++;
    };

    const toSend: typeof rows = [];
    for (const n of rows) {
      if (!settings.enabled) await skip(n.id, "Đang tắt gửi thông báo qua Lark.");
      else if (!settings.types.includes(n.type as never)) await skip(n.id, "Loại thông báo này không gửi qua Lark.");
      else if (since && n.createdAt < since) await skip(n.id, "Tạo trước khi bật gửi qua Lark.");
      else if (!n.user.larkUserId) await skip(n.id, "Người nhận chưa liên kết Lark.");
      else if (n.user.status !== "ACTIVE") await skip(n.id, "Tài khoản người nhận đã khoá.");
      else toSend.push(n);
    }

    for (let i = 0; i < toSend.length; i += CONCURRENCY) {
      const chunk = toSend.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (n) => {
          try {
            await sendLarkCard(n.user.larkUserId!, buildLarkCard(n));
            await prisma.notification.update({
              where: { id: n.id },
              data: { larkStatus: "SENT", sentToLarkAt: new Date(), larkNextAttemptAt: null, larkAttempts: n.larkAttempts + 1, larkError: null },
            });
            result.sent++;
          } catch (error) {
            const { permanent, reason } = classifyLarkError(error);
            const attempts = n.larkAttempts + 1;
            if (permanent || attempts >= LARK_MAX_ATTEMPTS) {
              await prisma.notification.update({ where: { id: n.id }, data: { larkStatus: "FAILED", larkNextAttemptAt: null, larkAttempts: attempts, larkError: reason } });
              result.failed++;
            } else {
              const delayMin = RETRY_DELAYS_MIN[Math.min(attempts - 1, RETRY_DELAYS_MIN.length - 1)];
              await prisma.notification.update({
                where: { id: n.id },
                data: { larkNextAttemptAt: new Date(Date.now() + delayMin * 60_000), larkAttempts: attempts, larkError: reason },
              });
              result.retrying++;
            }
          }
        }),
      );
      if (i + CONCURRENCY < toSend.length) await new Promise((r) => setTimeout(r, PAUSE_MS));
    }
    if (due.length < BATCH) break;
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Chạy nền trong tiến trình app (khởi động ở src/instrumentation.ts). Dùng globalThis để không chạy 2 vòng khi dev hot-reload.

const INTERVAL_MS = 10_000;
const KICK_DELAY_MS = 800;

type DispatcherState = { started: boolean; running: boolean; again: boolean; kickTimer: NodeJS.Timeout | null };
const g = globalThis as unknown as { __larkDispatcher?: DispatcherState };
const state: DispatcherState = (g.__larkDispatcher ??= { started: false, running: false, again: false, kickTimer: null });

async function runOnce() {
  if (state.running) {
    state.again = true;
    return;
  }
  state.running = true;
  try {
    do {
      state.again = false;
      // Làm mới bản nhớ đệm cài đặt (notify() đọc đồng bộ) kể cả khi chưa cấu hình Lark
      await getLarkNotifySettings(true);
      await dispatchLarkNotifications();
    } while (state.again);
  } catch (error) {
    console.error("[lark-notify] Lỗi lượt gửi:", error instanceof Error ? error.message : error);
  } finally {
    state.running = false;
  }
}

export function startLarkDispatcher(): void {
  if (state.started) return;
  state.started = true;
  const timer = setInterval(() => void runOnce(), INTERVAL_MS);
  timer.unref?.();
  void getLarkNotifySettings(true).catch(() => {});
}

/** Đánh thức bộ gửi (gọi sau khi tạo thông báo). Không làm gì nếu bộ gửi chưa chạy (script, kiểm thử đơn vị). */
export function kickLarkDispatch(): void {
  if (!state.started || state.kickTimer) return;
  state.kickTimer = setTimeout(() => {
    state.kickTimer = null;
    void runOnce();
  }, KICK_DELAY_MS);
  state.kickTimer.unref?.();
}
