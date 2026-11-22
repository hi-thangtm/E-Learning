import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { recordVideoProgress } from "@/lib/learning";
import { LIMITS, RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";

/**
 * Ghi tiến độ xem video: POST /api/learn/progress   body JSON { lessonId, position, watched }
 * - Trình học gọi mỗi 10 giây khi đang phát, khi tạm dừng / hết video, và bằng navigator.sendBeacon lúc rời trang
 *   (sendBeacon không gọi được server action → dùng route handler).
 * - Kiểm tra: đăng nhập → cùng nguồn (chống CSRF) → dữ liệu → quyền học bài (trong recordVideoProgress).
 * - Không ghi audit_logs (tiến độ học).
 */

const schema = z.object({
  lessonId: z.string().min(1).max(50),
  position: z.number().finite().min(0).max(86_400),
  watched: z.number().finite().min(0).max(86_400),
});

const MAX_BODY = 1024;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return json({ error: "Bạn cần đăng nhập." }, 401);
  if (user.mustChangePassword) return json({ error: "Bạn cần đổi mật khẩu trước khi học." }, 403);
  // 30 lần / phút / người (trình học gửi mỗi 10 giây)
  const limited = rateLimit(`progress:${user.id}`, LIMITS.learnProgress);
  if (!limited.ok) return json({ error: RATE_LIMIT_MESSAGE }, 429);

  // Chỉ nhận yêu cầu từ chính trang của hệ thống
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return json({ error: "Yêu cầu không hợp lệ." }, 403);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ error: "Dữ liệu quá lớn." }, 413);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: "Dữ liệu không hợp lệ." }, 400);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Dữ liệu không hợp lệ." }, 400);

  const { lessonId, position, watched } = parsed.data;
  const result = await recordVideoProgress(user.id, lessonId, { position, watched });
  if (!result.ok) return json({ error: result.error }, result.status);
  return json({ maxWatchedSeconds: result.maxWatchedSeconds, completed: result.completed, completion: result.completion });
}
