import type { ComponentType, ReactNode } from "react";
import { EmptyFiltered, EmptyState } from "@/components/empty-state";

/** Trạng thái rỗng của bảng (docs/design-system.md mục 5.6) — dùng `EmptyState` chung. */
export function DataTableEmpty({
  title,
  description,
  action,
  icon,
  filtered,
  clearHref,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  /** Đang có tìm kiếm / bộ lọc -> hiện "Không tìm thấy kết quả phù hợp" + nút Xoá bộ lọc */
  filtered?: boolean;
  clearHref?: string;
}) {
  if (filtered) return <EmptyFiltered clearHref={clearHref} />;
  return <EmptyState icon={icon} title={title} description={description} action={action} />;
}
