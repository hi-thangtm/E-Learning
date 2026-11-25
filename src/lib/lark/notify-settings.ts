import "server-only";
import { prisma } from "@/lib/db";
import { NOTIFICATION_TYPE_KEYS, type NotificationType } from "@/lib/notification-types";

/**
 * Cài đặt "Gửi thông báo qua Lark" (Việc L2) — system_settings key "LARK_NOTIFY" (không hiện ở Hệ thống › Cài đặt;
 * sửa ở Hệ thống › Kết nối Lark). `since` = mốc bật: thông báo tạo TRƯỚC mốc này không gửi bù.
 */

const KEY = "LARK_NOTIFY";

export type LarkNotifySettings = { enabled: boolean; since: string | null; types: NotificationType[] };

/** Mặc định bật: giao khoá, sắp hạn, quá hạn, nhắc nhở, cập nhật MAJOR / MINOR, chứng nhận sắp / đã hết hạn */
export const DEFAULT_LARK_TYPES: NotificationType[] = [
  "COURSE_ASSIGNED",
  "DUE_SOON",
  "OVERDUE",
  "REMINDER",
  "VERSION_MAJOR",
  "VERSION_MINOR",
  "CERTIFICATE_EXPIRING",
];

const DEFAULTS: LarkNotifySettings = { enabled: false, since: null, types: DEFAULT_LARK_TYPES };

function parse(value: unknown): LarkNotifySettings {
  const v = (value ?? {}) as Partial<LarkNotifySettings>;
  const types = Array.isArray(v.types) ? v.types.filter((t): t is NotificationType => NOTIFICATION_TYPE_KEYS.includes(t as NotificationType)) : DEFAULTS.types;
  const since = typeof v.since === "string" && !Number.isNaN(Date.parse(v.since)) ? v.since : null;
  return { enabled: v.enabled === true, since, types };
}

// Bản nhớ đệm trong tiến trình: notify() (đồng bộ, trong transaction) đọc mà không gọi DB.
let snapshot: { value: LarkNotifySettings; at: number } | null = null;
const TTL_MS = 30_000;

export async function getLarkNotifySettings(force = false): Promise<LarkNotifySettings> {
  if (!force && snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot.value;
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY }, select: { value: true } });
  const value = parse(row?.value);
  snapshot = { value, at: Date.now() };
  return value;
}

/**
 * Đọc ĐỒNG BỘ cho notify(): true = nên đánh dấu chờ gửi. Chưa có bản nhớ đệm (vừa khởi động) → true (an toàn: bộ gửi sẽ lọc lại
 * theo loại / mốc bật và chuyển SKIPPED). Bản nhớ đệm được làm mới mỗi vòng của bộ gửi.
 */
export function shouldQueueForLark(type: string): boolean {
  if (!snapshot) return true;
  const s = snapshot.value;
  return s.enabled && s.types.includes(type as NotificationType);
}

export async function saveLarkNotifySettings(next: { enabled: boolean; types: NotificationType[] }): Promise<{ before: LarkNotifySettings; after: LarkNotifySettings }> {
  const before = await getLarkNotifySettings(true);
  // Bật (từ tắt sang bật) → mốc mới: không gửi bù thông báo tạo lúc đang tắt
  const since = next.enabled ? (before.enabled && before.since ? before.since : new Date().toISOString()) : before.since;
  const after: LarkNotifySettings = { enabled: next.enabled, since, types: [...new Set(next.types)] };
  await prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: after }, update: { value: after } });
  snapshot = { value: after, at: Date.now() };
  return { before, after };
}
