import { after } from "next/server";
import { bunnyLibraryId, isBunnyConfigured, isBunnyVideoId, verifyWebhookSignature } from "@/lib/bunny";
import { syncBunnyLesson } from "@/lib/bunny-sync";
import { prisma } from "@/lib/db";
import { getClientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * Webhook Bunny Stream (Việc 31B) — Bunny gọi khi video đổi trạng thái. KHÔNG có phiên người dùng (ngoại lệ trong scripts/check-auth.ts).
 *
 * An toàn:
 * - Chỉ đọc `VideoGuid` (+ `VideoLibraryId` phải khớp thư viện). KHÔNG tin `Status` trong body: luôn hỏi lại Bunny bằng API key
 *   (syncBunnyLesson) → người ngoài gửi webhook giả cũng không đổi được trạng thái.
 * - Có BUNNY_STREAM_READONLY_KEY → chữ ký X-BunnyStream-Signature (HMAC-SHA256 hex của body thô) phải khớp, sai thì bỏ qua.
 * - Giới hạn tần suất theo IP; body tối đa 4KB.
 * - LUÔN trả 200 "ok" nhanh (không lộ có / không có video); việc hỏi Bunny chạy sau khi đã trả lời (after()).
 */

const MAX_BODY = 4096;
const ok = () => new Response("ok", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export async function POST(request: Request) {
  if (!rateLimit(`bunny-webhook:${getClientIp(request.headers)}`, LIMITS.bunnyWebhookIp).ok) return ok();
  if (!(await isBunnyConfigured())) return ok();

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY) return ok();
  const raw = await request.text();
  if (raw.length > MAX_BODY) return ok();
  if (!(await verifyWebhookSignature(raw, request.headers.get("x-bunnystream-signature")))) return ok();

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return ok();
  }
  const { VideoGuid, VideoLibraryId } = (body ?? {}) as { VideoGuid?: unknown; VideoLibraryId?: unknown };
  if (typeof VideoGuid !== "string" || !isBunnyVideoId(VideoGuid)) return ok();
  if (String(VideoLibraryId ?? "") !== (await bunnyLibraryId())) return ok();

  const videoId = VideoGuid.toLowerCase();
  after(async () => {
    try {
      const lessons = await prisma.lesson.findMany({
        where: { videoProvider: "BUNNY", videoId: { in: [VideoGuid, videoId] }, videoStatus: "PROCESSING" },
        select: { id: true, videoId: true },
        take: 5,
      });
      for (const l of lessons) await syncBunnyLesson({ id: l.id, videoId: l.videoId! });
    } catch (error) {
      console.error("[bunny-webhook] Lỗi:", error);
    }
  });
  return ok();
}
