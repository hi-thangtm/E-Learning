"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { ErrorView, errorDigest } from "@/components/error-view";

/**
 * Lỗi bất ngờ ở trang học (toàn màn hình). Tiến độ đã lưu không mất — thử lại hoặc về Tổng quan.
 * Chỉ hiện mã lỗi (digest), không hiện nội dung lỗi.
 */
export default function LearnError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <ErrorView
      className="min-h-dvh"
      icon={<TriangleAlert />}
      title="Không mở được bài học"
      description="Hệ thống gặp sự cố khi tải bài học. Tiến độ bạn đã học vẫn được giữ. Hãy thử lại; nếu vẫn lỗi, gửi mã lỗi bên dưới cho quản trị hệ thống."
      digest={errorDigest(error)}
      onRetry={retry}
    />
  );
}
