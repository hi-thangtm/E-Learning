import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { ErrorView } from "@/components/error-view";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

/**
 * Trang không tìm thấy: khi gọi notFound() (VD /assign/rules/<id> ngoài phạm vi) hoặc đường dẫn không khớp route nào.
 * Không nói rõ “không có quyền” hay “không tồn tại” — tránh dò id ngoài phạm vi.
 */
export default function NotFound() {
  return (
    <ErrorView
      className="min-h-dvh bg-background"
      tone="warning"
      icon={<SearchX />}
      title="Không tìm thấy trang"
      description="Trang bạn tìm không tồn tại, đã bị xoá hoặc bạn không có quyền xem."
    />
  );
}
