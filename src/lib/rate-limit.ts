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
} as const;

type Bucket = number[];
const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

/** Dọn khoá đã hết hạn mỗi phút để Map không phình mãi. */
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, hits] of buckets) {
    // Cửa sổ dài nhất hiện dùng là 60 giây
    if (hits.length === 0 || now - hits[hits.length - 1] > 60_000) buckets.delete(key);
  }
}

export type RateResult = { ok: true } | { ok: false; retryAfterSeconds: number };

/** Ghi nhận 1 lần dùng của `key`; vượt `limit` lần trong `windowMs` → { ok: false }. Lần bị từ chối không được đếm. */
export function rateLimit(key: string, rule: { limit: number; windowMs: number }, now = Date.now()): RateResult {
  sweep(now);
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < rule.windowMs);
  if (hits.length >= rule.limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((hits[0] + rule.windowMs - now) / 1000)) };
  }
  hits.push(now);
  buckets.set(key, hits);
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
