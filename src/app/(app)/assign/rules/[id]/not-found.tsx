import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { ErrorView } from "@/components/error-view";

export const metadata: Metadata = { title: "Không tìm thấy quy tắc" };

/** notFound() của trang này: ghi rõ đối tượng + nút về danh sách. Không nói rõ “không có quyền” hay “không tồn tại”. */
export default function NotFound() {
  return (
    <ErrorView
      tone="warning"
      icon={<SearchX />}
      title="Không tìm thấy quy tắc"
      description="Quy tắc giao tự động này không tồn tại, đã bị xoá hoặc nằm ngoài phạm vi quyền của bạn."
      homeHref="/assign/rules"
      homeLabel="Về danh sách quy tắc"
    />
  );
}
