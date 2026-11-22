import { createHash, timingSafeEqual } from "node:crypto";
import { runDailyJob } from "@/lib/jobs/daily";

/**
 * Chạy tác vụ hằng ngày từ bộ lập lịch (cron): POST /api/jobs/daily
 * Header bắt buộc: Authorization: Bearer <CRON_SECRET>. Thiếu biến CRON_SECRET hoặc sai khoá → 401.
 */

export const maxDuration = 900;

function sameSecret(given: string, expected: string): boolean {
  // So sánh an toàn thời gian: băm 2 chuỗi về cùng độ dài rồi timingSafeEqual
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";

  if (!secret || !token || !sameSecret(token, secret)) {
    return Response.json({ error: "Không có quyền chạy tác vụ." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  const result = await runDailyJob({ triggeredBy: null, trigger: "cron" });
  return Response.json(result, { status: result.ok ? 200 : 409, headers: { "Cache-Control": "no-store" } });
}
