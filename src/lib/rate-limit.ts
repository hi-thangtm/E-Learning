import "server-only";

/**
 * Giới hạn tần suất (Việc 29A) — cửa sổ trượt, lưu TRONG BỘ NHỚ của tiến trình Node.
 * Đủ cho 1 máy chủ chạy 1 tiến trình. Chạy nhiều máy chủ / nhiều tiến trình → chuyển kho đếm sang Postgres hoặc Redis
 * (giữ nguyên chữ ký `rateLimit`).
 *
 * IP người dùng: chỉ tin `X-Forwarded-For` / `X-Real-IP` khi TRUST_PROXY=true (chạy sau Caddy / reverse proxy do ta quản lý).
 * Mặc định không tin (người dùng tự đặt header được) → mọi yêu cầu chung 1 khoá IP "untrusted" (chỉ phù hợp chạy dev).
 */

export const RATE_LIMIT_MESSAGE = "Bạn thao tác quá nhanh, vui lòng thử lại sau.";

export const LIMITS = {
  loginIp: { limit: 10, windowMs: 60_000 },
  loginCode: { limit: 5, windowMs: 60_000 },
  verifyIp: { limit: 30, windowMs: 60_000 },
  quickSearch: { limit: 60, windowMs: 60_000 },
  learnProgress: { limit: 30, windowMs: 60_000 },
  fileDownload: { limit: 120, windowMs: 60_000 },
  /** Tạo video Bunny để tải lên (Việc 31B, security-review #8): 20 lần / giờ / người */
  bunnyPrepare: { limit: 20, windowMs: 60 * 60_000 },
  /** Webhook Bunny theo IP */
  bunnyWebhookIp: { limit: 60, windowMs: 60_000 },
  /** Nút "Kiểm tra kết nối" Bunny */
  bunnyTest: { limit: 10, windowMs: 60_000 },
  /** Nút "Kiểm tra kết nối" Lark */
  larkTest: { limit: 10, windowMs: 60_000 },
  /** Tải cây phòng ban / ghép / chạy thử / áp dụng đồng bộ Lark (mỗi lần đọc toàn bộ danh bạ) */
  larkSync: { limit: 20, windowMs: 60_000 },
} as const;

/** Lần dùng của 1 khoá + độ dài cửa sổ của khoá đó (để dọn đúng hạn, kể cả cửa sổ 1 giờ) */
type Bucket = { hits: number[]; windowMs: number };
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Dọn khoá đã hết hạn mỗi phút để Map không phình mãi. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, b] of buckets) {
    if (b.hits.length === 0 || now - b.hits[b.hits.length - 1] > b.windowMs) buckets.delete(key);
  }
}

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Ghi nhận 1 lần dùng của `key`; vượt `limit` lần trong `windowMs` → { ok: false }. Lần bị từ chối không được đếm. */
export function rateLimit(key: string, rule: { limit: number; windowMs: number }, now = Date.now()): RateResult {
  sweep(now);
  const hits = (buckets.get(key)?.hits ?? []).filter((t) => now - t < rule.windowMs);
  if (hits.length >= rule.limit) {
    buckets.set(key, { hits, windowMs: rule.windowMs });
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + rule.windowMs - now) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, { hits, windowMs: rule.windowMs });
  return { ok: true };
}

/** IP người gửi (xem ghi chú đầu file). */
export function getClientIp(headers: Headers): string {
  if (process.env.TRUST_PROXY !== "true") return "untrusted";
  // Lấy địa chỉ PHẢI CÙNG: do proxy gần nhất (Caddy) thêm vào, người dùng không giả được phần này
  const forwarded = headers.get("x-forwarded-for");
  const ip = forwarded?.split(",").map((s) => s.trim()).filter(Boolean).pop() ?? headers.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : "unknown";
}

/** Phản hồi 429 cho route handler. */
export function tooManyRequests(retryAfterSeconds: number): Response {
  return new Response(RATE_LIMIT_MESSAGE, {
    status: 429,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": String(retryAfterSeconds) },
  });
}
