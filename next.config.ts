import type { NextConfig } from "next";

/** Font của PDF chứng nhận (đọc bằng đường dẫn lúc chạy → phải khai báo để có trong bản standalone). */
const CERTIFICATE_FONTS = ["./node_modules/@expo-google-fonts/be-vietnam-pro/{400Regular,600SemiBold,700Bold}/*.ttf"];

const nextConfig: NextConfig = {
  output: "standalone",
  // @react-pdf/renderer chỉ có bản ESM, nạp nguyên gói ở server thay vì đóng gói lại
  serverExternalPackages: ["@react-pdf/renderer"],
  outputFileTracingIncludes: {
    "/api/certificates/[id]/pdf": CERTIFICATE_FONTS,
    "/system/certificate-templates/preview": CERTIFICATE_FONTS,
  },
  experimental: {
    serverActions: {
      // Import nhân viên từ Excel: file tối đa 5MB (+ phần đầu multipart). Mặc định chỉ 1MB.
      bodySizeLimit: "6mb",
    },
  },
  async headers() {
    // Header bảo mật chung (Việc 29A). CSP có nonce đặt ở src/proxy.ts.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      // HSTS chỉ khi chạy production (sau HTTPS) — bật ở dev sẽ khiến trình duyệt ép https://localhost
      ...(process.env.NODE_ENV === "production"
        ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
        : []),
    ];
    return [
      { source: "/:path*", headers: security },
      {
        // Trang tra cứu chứng nhận công khai: không cho máy tìm kiếm lập chỉ mục
        source: "/verify/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
      { source: "/verify", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
