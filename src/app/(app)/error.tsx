"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { ErrorView, errorDigest } from "@/components/error-view";

/**
 * Lỗi bất ngờ trong các trang sau đăng nhập (vẫn giữ sidebar + header của (app)/layout.tsx).
 * Next.js 16: props `error` (unknown) + `retry()` — node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md.
 * Production: lỗi từ server chỉ có `digest` (không có nội dung lỗi) → hiện mã để báo quản trị tra log; KHÔNG hiện message / stack.
 */
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorView
      icon={<TriangleAlert />}
      title="Đã có lỗi xảy ra"
      description="Hệ thống gặp sự cố khi tải trang này. Bạn hãy thử lại; nếu vẫn lỗi, gửi mã lỗi bên dưới cho quản trị hệ thống."
      digest={errorDigest(error)}
      onRetry={retry}
    />
  );
}
