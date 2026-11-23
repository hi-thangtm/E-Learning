"use client";

import { useEffect } from "react";
import { Be_Vietnam_Pro } from "next/font/google";
import { ServerCrash } from "lucide-react";
import { ErrorView, errorDigest } from "@/components/error-view";
import "./globals.css";

const font = Be_Vietnam_Pro({ subsets: ["vietnamese", "latin"], weight: ["400", "500"], display: "swap" });

/**
 * Lỗi ở root layout — THAY cả root layout nên phải tự có <html>/<body>, CSS và font (Next.js 16 docs: error.md → Global Error).
 * Client component: không dùng `metadata` được → dùng thẻ <title> của React. Chỉ hiện mã lỗi (digest).
 */
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="vi">
      <body className={`${font.className} bg-background text-foreground antialiased`}>
        <title>Đã có lỗi xảy ra</title>
        <ErrorView
          className="min-h-dvh"
          icon={<ServerCrash />}
          title="Hệ thống đang gặp sự cố"
          description="Không tải được trang. Bạn hãy thử lại sau ít phút; nếu vẫn lỗi, gửi mã lỗi bên dưới cho quản trị hệ thống."
          digest={errorDigest(error)}
          onRetry={retry}
        />
      </body>
    </html>
  );
}
