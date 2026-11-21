import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { VideoStatus } from "@prisma/client";

/**
 * Bunny Stream — CHỈ chạy ở server. API key và token key không bao giờ gửi về trình duyệt.
 * Tài liệu: bunny.net/docs (Create / Get / Delete video, TUS resumable uploads, Embed token authentication).
 *
 * - Tải lên: trình duyệt tải THẲNG lên Bunny bằng TUS (không qua server Next.js); server chỉ tạo video + ký chữ ký.
 * - Phát: iframe Bunny kèm token hết hạn, tạo ở server mỗi lần mở bài.
 */

const API = "https://video.bunnycdn.com";
export const BUNNY_TUS_ENDPOINT = "https://video.bunnycdn.com/tusupload";
// Host nhúng trình phát Bunny (tài liệu mới dùng player.mediadelivery.net — đổi tại đây nếu cần)
const EMBED_HOST = "https://iframe.mediadelivery.net";

const TUS_EXPIRE_SECONDS = 60 * 60; // chữ ký tải lên: 1 giờ
const EMBED_EXPIRE_SECONDS = 6 * 60 * 60; // token xem: 6 giờ

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

function requireConfig(): BunnyConfig {
  const config = bunnyConfig();
  if (!config) throw new Error("Chưa cấu hình Bunny Stream (BUNNY_STREAM_LIBRARY_ID / API_KEY / TOKEN_KEY).");
  return config;
}

const sha256Hex = (value: string) => createHash("sha256").update(value).digest("hex");

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isBunnyVideoId = (id: string) => GUID.test(id);

async function bunnyFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { libraryId, apiKey } = requireConfig();
  return fetch(`${API}/library/${libraryId}${path}`, {
    ...init,
    headers: { AccessKey: apiKey, Accept: "application/json", "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
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

/** Trạng thái + thời lượng (giây). Bunny status: 4 Finished, 5 Error, 6 UploadFailed, còn lại đang xử lý. */
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
  const params = new URLSearchParams({ token, expires: String(expires), autoplay: "false", preload: "true", responsive: "true" });
  return `${EMBED_HOST}/embed/${libraryId}/${videoId}?${params}`;
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
