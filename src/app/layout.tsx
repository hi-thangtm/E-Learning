import type { Metadata } from "next";
import { headers } from "next/headers";
import { Be_Vietnam_Pro } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { getBranding } from "@/lib/settings";
import { SETTING_META } from "@/lib/settings-meta";
import "./globals.css";

// Font có đủ dấu tiếng Việt (font Geist mặc định không có bộ chữ tiếng Việt)
const font = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

/** Tiêu đề tab theo tên hệ thống (Cài đặt). Không đọc được database (VD lúc build) -> tên mặc định. */
export async function generateMetadata(): Promise<Metadata> {
  let name: string = SETTING_META.SYSTEM_NAME.default;
  try {
    name = (await getBranding()).name;
  } catch {
    // giữ tên mặc định
  }
  return { title: { default: name, template: `%s · ${name}` }, description: "Hệ thống đào tạo nội bộ tập đoàn" };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Đọc header -> mọi trang render động, để Next.js gắn nonce CSP (src/proxy.ts) cho script của trang
  await headers();
  return (
    <html lang="vi">
      <body className={`${font.className} antialiased`}>
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
