import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { ErrorView } from "@/components/error-view";

export const metadata: Metadata = { title: "Không tìm thấy trang" };

/**
 * Không tìm thấy — trong khung có sidebar + header (khi trang trong (app) gọi notFound(), VD /assign/rules/<id> ngoài phạm vi).
 * Đường dẫn không khớp route nào → src/app/not-found.tsx (toàn trang). Không nói rõ “không có quyền” hay “không tồn tại”.
 */
export default function AppNotFound() {
  return (
    <ErrorView
      tone="warning"
      icon={<SearchX />}
      title="Không tìm thấy trang"
      description="Trang bạn tìm không tồn tại, đã bị xoá hoặc bạn không có quyền xem."
    />
  );
}
