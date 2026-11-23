import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { VideoStatus } from "@prisma/client";

/**
 * Bunny Stream — CHỈ chạy ở server. API key, token key, read-only key không bao giờ gửi về trình duyệt.
 * Tài liệu (đối chiếu 23/11/2026): bunny.net/docs — Create / Get / Delete / List video, TUS resumable uploads,
 * Embed token authentication, Webhooks (ký HMAC-SHA256), player.js. Hướng dẫn vận hành: docs/bunny-setup.md.
 *
 * - Tải lên: trình duyệt tải THẲNG lên Bunny bằng TUS (không qua server Next.js); server chỉ tạo video + ký chữ ký.
 * - Phát: iframe Bunny kèm token hết hạn, tạo ở server mỗi lần mở bài.
 *
 * Biến môi trường:
 * - BẮT BUỘC (đủ 3 mới bật Bunny): BUNNY_STREAM_LIBRARY_ID, BUNNY_STREAM_API_KEY, BUNNY_STREAM_TOKEN_KEY.
 * - Tuỳ chọn: BUNNY_STREAM_READONLY_KEY — Read-Only API key của thư viện, dùng kiểm chữ ký webhook.
 * - CHỈ dùng khi kiểm thử (trỏ sang Bunny giả lập e2e/mock-bunny), để trống khi chạy thật:
 *   BUNNY_API_BASE, BUNNY_TUS_ENDPOINT, BUNNY_EMBED_HOST.
 */

const DEFAULT_API = "https://video.bunnycdn.com";
const DEFAULT_TUS = "https://video.bunnycdn.com/tusupload";
// Tài liệu hiện hành dùng player.mediadelivery.net (iframe.mediadelivery.net là host cũ, CSP vẫn cho phép)
const DEFAULT_EMBED = "https://player.mediadelivery.net";

const TUS_EXPIRE_SECONDS = 60 * 60; // chữ ký tải lên: 1 giờ
const EMBED_EXPIRE_SECONDS = 6 * 60 * 60; // token xem: 6 giờ

/** URL http(s) hợp lệ (bỏ "/" cuối) hoặc mặc định. */
function urlFromEnv(name: string, fallback: string): string {
  const value = process.env[name]?.trim();
  if (!value) return fallback;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return fallback;
    return value.replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

const apiBase = () => urlFromEnv("BUNNY_API_BASE", DEFAULT_API);
export const bunnyTusEndpoint = () => urlFromEnv("BUNNY_TUS_ENDPOINT", DEFAULT_TUS);
const embedHost = () => urlFromEnv("BUNNY_EMBED_HOST", DEFAULT_EMBED);

type BunnyConfig = { libraryId: string; apiKey: string; tokenKey: string };

/** Đủ 3 biến môi trường mới bật Bunny. */
function bunnyConfig(): BunnyConfig | null {
  const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID?.trim();
  const apiKey = process.env.BUNNY_STREAM_API_KEY?.trim();
  const tokenKey = process.env.BUNNY_STREAM_TOKEN_KEY?.trim();
  if (!libraryId || !apiKey || !tokenKey || !/^\d+$/.test(libraryId)) return null;
  return { libraryId, apiKey, tokenKey };
}

export function isBunnyConfigured(): boolean {
  return bunnyConfig() !== null;
}

export function bunnyLibraryId(): string | null {
  return bunnyConfig()?.libraryId ?? null;
}

function requireConfig(): BunnyConfig {
  const config = bunnyConfig();
  if (!config) throw new Error("Chưa cấu hình Bunny Stream (BUNNY_STREAM_LIBRARY_ID / API_KEY / TOKEN_KEY).");
  return config;
}

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isBunnyVideoId = (id: string) => GUID.test(id);

async function bunnyFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const { libraryId, apiKey } = requireConfig();
  const { timeoutMs = 15_000, ...rest } = init;
  return fetch(`${apiBase()}/library/${libraryId}${path}`, {
    ...rest,
    headers: { AccessKey: apiKey, Accept: "application/json", "Content-Type": "application/json", ...rest.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(timeoutMs),
  });
}

/** Tạo video rỗng trên Bunny -> guid (để trình duyệt tải file vào bằng TUS). */
export async function createBunnyVideo(title: string): Promise<string> {
  const res = await bunnyFetch("/videos", { method: "POST", body: JSON.stringify({ title: title.slice(0, 200) || "Video" }) });
  if (!res.ok) throw new Error(`Bunny tạo video lỗi ${res.status}`);
  const data = (await res.json()) as { guid?: string };
  if (!data.guid || !isBunnyVideoId(data.guid)) throw new Error("Bunny không trả về mã video.");
  return data.guid;
}

/**
 * Trạng thái + thời lượng (giây). Mã status của API: 0 Created, 1 Uploaded, 2 Processing, 3 Transcoding, 4 Finished,
 * 5 Error, 6 UploadFailed, 7 JitSegmenting, 8 JitPlaylistsCreated (7/8 chỉ khi bật JIT encoding — coi là đang xử lý).
 * Lưu ý: mã Status trong WEBHOOK là bảng KHÁC (3 = Finished) — webhook không dùng mã đó, luôn hỏi lại API.
 */
export async function getBunnyVideo(videoId: string): Promise<{ status: number; length: number; encodeProgress: number }> {
  if (!isBunnyVideoId(videoId)) throw new Error("Mã video Bunny không hợp lệ.");
  const res = await bunnyFetch(`/videos/${videoId}`);
  if (!res.ok) throw new Error(`Bunny xem video lỗi ${res.status}`);
  const data = (await res.json()) as { status?: number; length?: number; encodeProgress?: number };
  return { status: data.status ?? 0, length: data.length ?? 0, encodeProgress: data.encodeProgress ?? 0 };
}

export function bunnyStatusToVideoStatus(status: number): VideoStatus {
  if (status === 4) return "READY";
  if (status === 5 || status === 6) return "FAILED";
  return "PROCESSING";
}

/** Xoá video trên Bunny. Lỗi chỉ ghi log, KHÔNG chặn thao tác chính (thay video, xoá bài...). */
export async function deleteBunnyVideo(videoId: string | null | undefined): Promise<void> {
  if (!videoId || !isBunnyVideoId(videoId) || !bunnyConfig()) return;
  try {
    const res = await bunnyFetch(`/videos/${videoId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) console.error(`[bunny] Xoá video ${videoId} lỗi ${res.status}`);
  } catch (error) {
    console.error(`[bunny] Xoá video ${videoId} lỗi:`, error);
  }
}

/** Chữ ký TUS: SHA256_HEX(libraryId + apiKey + expire + videoId), hết hạn sau 1 giờ. */
export function tusSignature(videoId: string): { libraryId: string; signature: string; expire: number } {
  const { libraryId, apiKey } = requireConfig();
  const expire = Math.floor(Date.now() / 1000) + TUS_EXPIRE_SECONDS;
  return { libraryId, expire, signature: sha256Hex(`${libraryId}${apiKey}${expire}${videoId}`) };
}

/** URL nhúng trình phát kèm token: SHA256_HEX(tokenKey + videoId + expires), hết hạn sau 6 giờ. */
export function bunnyEmbedUrl(videoId: string): string {
  const { libraryId, tokenKey } = requireConfig();
  const expires = Math.floor(Date.now() / 1000) + EMBED_EXPIRE_SECONDS;
  const token = sha256Hex(`${tokenKey}${videoId}${expires}`);
  // `autoplay` của Bunny mặc định true → tắt; `responsive` không còn trong tài liệu (khung 16:9 do trang tự làm)
  const params = new URLSearchParams({ token, expires: String(expires), autoplay: "false", preload: "true" });
  return `${embedHost()}/embed/${libraryId}/${videoId}?${params}`;
}

// --- Vé tải lên: chứng minh videoId do CHÍNH server tạo cho bài này (không cho gắn / xoá video Bunny tuỳ ý) ---

function ticketSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("Thiếu AUTH_SECRET.");
  return secret;
}

export function createUploadTicket(lessonId: string, videoId: string, expire: number): string {
  const mac = createHmac("sha256", ticketSecret()).update(`${lessonId}:${videoId}:${expire}`).digest("hex");
  return `${expire}.${mac}`;
}

export function verifyUploadTicket(lessonId: string, videoId: string, ticket: string): boolean {
  const [expireText, mac] = ticket.split(".");
  const expire = Number(expireText);
  // Cho thêm 1 giờ sau hạn chữ ký để kịp báo hoàn tất / huỷ khi file lớn tải lâu
  if (!Number.isInteger(expire) || !mac || expire + 60 * 60 < Math.floor(Date.now() / 1000)) return false;
  const expected = createHmac("sha256", ticketSecret()).update(`${lessonId}:${videoId}:${expire}`).digest("hex");
  return mac.length === expected.length && timingSafeEqual(Buffer.from(mac), Buffer.from(expected));
}

// --- Webhook: chữ ký HMAC-SHA256 (hex) của body thô, khoá = Read-Only API key của thư viện (tuỳ chọn) ---

export function isWebhookSigningEnabled(): boolean {
  return !!process.env.BUNNY_STREAM_READONLY_KEY?.trim();
}

/** Không cấu hình khoá read-only → true (không kiểm). Có khoá → chữ ký phải khớp. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const key = process.env.BUNNY_STREAM_READONLY_KEY?.trim();
  if (!key) return true;
  if (!signature || !/^[0-9a-f]{64}$/i.test(signature)) return false;
  const expected = createHmac("sha256", key).update(rawBody).digest("hex");
  return timingSafeEqual(Buffer.from(signature.toLowerCase()), Buffer.from(expected));
}

// --- Trang Cài đặt: kiểm tra kết nối + hiển thị cấu hình (KHÔNG bao giờ trả khoá) ---

export type BunnyConnectionResult =
  | { status: "ok"; videoCount: number }
  | { status: "not_configured" }
  | { status: "bad_key" }
  | { status: "bad_library" }
  | { status: "unreachable" };

/** Gọi API danh sách video (1 trang) — 401/403 sai API key, 404 sai Library ID, lỗi mạng / 5xx / quá giờ = không gọi được. */
export async function testBunnyConnection(): Promise<BunnyConnectionResult> {
  if (!bunnyConfig()) return { status: "not_configured" };
  try {
    const res = await bunnyFetch("/videos?page=1&itemsPerPage=1", { timeoutMs: 8_000 });
    if (res.status === 401 || res.status === 403) return { status: "bad_key" };
    if (res.status === 404) return { status: "bad_library" };
    if (!res.ok) return { status: "unreachable" };
    const data = (await res.json()) as { totalItems?: number };
    return { status: "ok", videoCount: Number(data.totalItems ?? 0) };
  } catch {
    return { status: "unreachable" };
  }
}

const mask = (value: string | undefined) => {
  const v = value?.trim();
  if (!v) return null;
  return `••••${v.slice(-4)}`;
};

/** Cấu hình để HIỂN THỊ: khoá chỉ còn "••••" + 4 ký tự cuối. */
export function maskedBunnyConfig() {
  return {
    configured: isBunnyConfigured(),
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID?.trim() || null,
    apiKey: mask(process.env.BUNNY_STREAM_API_KEY),
    tokenKey: mask(process.env.BUNNY_STREAM_TOKEN_KEY),
    readonlyKey: mask(process.env.BUNNY_STREAM_READONLY_KEY),
    /** Đang trỏ sang địa chỉ khác Bunny thật (môi trường kiểm thử) */
    customEndpoints: [apiBase() !== DEFAULT_API, bunnyTusEndpoint() !== DEFAULT_TUS, embedHost() !== DEFAULT_EMBED].some(Boolean),
  };
}

// Kết quả "Kiểm tra kết nối" gần nhất (bộ nhớ tiến trình) — trang Cài đặt hiển thị; khởi động lại app → "Chưa kiểm tra".
let lastConnection: { result: BunnyConnectionResult; at: Date } | null = null;

export function rememberBunnyConnection(result: BunnyConnectionResult): void {
  lastConnection = { result, at: new Date() };
}

export function lastBunnyConnection(): { result: BunnyConnectionResult; at: Date } | null {
  return lastConnection;
}
