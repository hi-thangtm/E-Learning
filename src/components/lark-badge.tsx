import { StatusBadge } from "@/components/status-badge";
import { cn } from "@/lib/utils";

/** Badge “Lark” cạnh tên người dùng liên kết Lark (Việc L1) — họ tên, phòng ban… đồng bộ từ Lark. */
export function LarkBadge({ className }: { className?: string }) {
  return (
    <span title="Đồng bộ từ Lark — họ tên, email, điện thoại, công ty, phòng ban, ngày vào làm sửa trên Lark" className={cn("inline-flex shrink-0", className)}>
      <StatusBadge tone="info">Lark</StatusBadge>
    </span>
  );
}
