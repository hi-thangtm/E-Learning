import { getSetting } from "@/lib/settings";
import { readFile } from "@/lib/storage";

/**
 * Logo hệ thống — CÔNG KHAI (trang đăng nhập và /verify cần hiện khi chưa đăng nhập): GET /api/branding/logo[?v=<phiên bản>]
 * Chỉ phục vụ đúng file đang đặt ở cài đặt SYSTEM_LOGO_KEY (PNG / WEBP), không nhận đường dẫn từ người dùng.
 * Cache 5 phút ở trình duyệt; URL có ?v= đổi theo logo nên đổi logo là thấy ngay.
 */
export async function GET(request: Request) {
  const key = await getSetting("SYSTEM_LOGO_KEY");
  if (!key) return new Response("Chưa đặt logo.", { status: 404, headers: { "Cache-Control": "public, max-age=60" } });

  const etag = `"${key.slice(key.lastIndexOf("/") + 1)}"`;
  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers: { ETag: etag } });

  const file = await readFile(key);
  if (!file) return new Response("Không tìm thấy logo.", { status: 404 });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Cache-Control": "public, max-age=300, stale-while-revalidate=86400",
      ETag: etag,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
