import { NextResponse, type NextRequest } from "next/server";

/**
 * Content-Security-Policy với nonce cho mỗi request (Việc 29A — theo node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
 * Next.js tự gắn nonce cho script của nó khi thấy CSP trong request header; mọi trang render động (root layout đọc headers()).
 *
 * - script-src: chỉ script có nonce + 'strict-dynamic' (script do script tin cậy chèn vào — VD YouTube IFrame API — được chạy theo).
 *   'unsafe-eval' chỉ ở dev (React dùng eval để dựng lại stack lỗi).
 * - style-src 'unsafe-inline': thuộc tính style="" (thanh tiến độ, biểu đồ recharts, vị trí popup của Base UI…) KHÔNG gắn nonce được;
 *   style không chạy mã nên rủi ro thấp hơn script nhiều.
 * - frame-src 'self': xem trước / đọc PDF trong iframe trỏ tới /api/files (cùng nguồn). Ngoài ra chỉ YouTube (nocookie) và trình phát
 *   Bunny (player.mediadelivery.net — host hiện hành; iframe.mediadelivery.net — host cũ).
 * - connect-src video.bunnycdn.com: trình duyệt tải video thẳng lên Bunny Stream (TUS).
 *   Bản Vercel (NEXT_PUBLIC_DIRECT_UPLOAD=1): thêm vercel.com/api/blob/ — PDF tải thẳng lên Vercel Blob.
 * - Kiểm thử (Bunny giả lập): BUNNY_EMBED_HOST / BUNNY_TUS_ENDPOINT được đặt → thêm ĐÚNG origin của chúng (không dùng *).
 * Route /api/* không qua proxy (không trả HTML); header chung khác đặt ở next.config.ts.
 */
/** Origin của URL trong biến môi trường (chỉ http / https); không đặt hoặc sai → "" */
function envOrigin(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? ` ${url.origin}` : "";
  } catch {
    return "";
  }
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDev = process.env.NODE_ENV === "development";
  // Chạy HTTPS thật (AUTH_URL https) -> bảo trình duyệt tự nâng mọi yêu cầu http lên https
  const isHttps = process.env.AUTH_URL?.startsWith("https://") ?? false;
  // Bản Vercel: trình duyệt tải PDF thẳng lên Vercel Blob (lesson-dialog.tsx)
  const directUpload = process.env.NEXT_PUBLIC_DIRECT_UPLOAD === "1" ? " https://vercel.com/api/blob/" : "";

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob: https://i.ytimg.com`,
    `font-src 'self'`,
    `connect-src 'self' https://video.bunnycdn.com${envOrigin("BUNNY_TUS_ENDPOINT")}${directUpload}${isDev ? " ws: wss:" : ""}`,
    `frame-src 'self' https://www.youtube-nocookie.com https://iframe.mediadelivery.net https://player.mediadelivery.net${envOrigin("BUNNY_EMBED_HOST")}`,
    `media-src 'self' blob:`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    ...(isHttps ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      // Bỏ qua: route API, file tĩnh của Next, ảnh tối ưu, ảnh / file trong public, và các yêu cầu prefetch
      source: "/((?!api|_next/static|_next/image|favicon.ico|images/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
