import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

// Font có đủ dấu tiếng Việt (font Geist mặc định không có bộ chữ tiếng Việt)
const font = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "E-Learning", template: "%s | E-Learning" },
  description: "Hệ thống đào tạo nội bộ tập đoàn",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className={`${font.className} antialiased`}>{children}</body>
    </html>
  );
}
