import { getCurrentUser } from "@/lib/current-user";
import { takePerfQueryCount } from "@/lib/db";

/**
 * Đo hiệu năng (Việc 30): GET /api/perf/queries → số truy vấn Prisma kể từ lần gọi trước, rồi đặt lại về 0.
 * Bộ đo (scripts/bench-pages.ts) gọi TUẦN TỰ: tải 1 trang → đọc số này = số truy vấn của đúng trang đó.
 * Chỉ hoạt động khi app chạy với PERF_LOG_QUERIES=true; mặc định trả 404 như route không tồn tại.
 * Bản thân lần gọi này cũng chạy truy vấn đăng nhập — bộ đo trừ phần đó (đọc 2 lần liên tiếp để biết “nền”).
 */
export async function GET() {
  const user = await getCurrentUser();
  const count = takePerfQueryCount();
  if (count === null) return new Response("Not Found", { status: 404 });
  if (!user) return Response.json({ error: "Bạn cần đăng nhập." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ queries: count }, { headers: { "Cache-Control": "no-store" } });
}
