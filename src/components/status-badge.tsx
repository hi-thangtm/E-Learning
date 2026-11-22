import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Badge trạng thái kiểu tonal (nền màu 16% + chữ màu) — docs/design-system.md mục 5.4.
 * Bảng màu: success = hoạt động/hoàn thành, warning = chờ, destructive = quá hạn/huỷ,
 * secondary = khoá/nháp/ẩn, info = lưu trữ, primary = đang học/bắt buộc.
 */
export type StatusTone = "success" | "warning" | "destructive" | "secondary" | "info" | "primary";

const TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-success/16 text-success",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/16 text-destructive",
  secondary: "bg-secondary text-secondary-foreground",
  info: "bg-info/16 text-info",
  primary: "bg-primary/16 text-primary",
};

export function StatusBadge({
  tone,
  children,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        // Badge không bao giờ xuống dòng / bị co lại (docs/design-system.md mục 5.4)
        "inline-flex h-6 shrink-0 items-center rounded-sm px-2.5 text-[13px] font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Badge cho cột isActive: "Đang dùng" / "Đã ẩn". */
export function ActiveBadge({ active }: { active: boolean }) {
  return active ? (
    <StatusBadge tone="success">Đang dùng</StatusBadge>
  ) : (
    <StatusBadge tone="secondary">Đã ẩn</StatusBadge>
  );
}

/**
 * Ô đếm số dạng viên thuốc (VD “6 mới”, số cạnh tab / chip). Không xuống dòng, không co lại.
 * `tone` theo bảng màu tonal; "muted" = nền xám; "card" = nền trắng (đặt trên nền màu nhạt).
 */
export function CountPill({
  children,
  tone = "primary",
  className,
}: {
  children: ReactNode;
  tone?: StatusTone | "muted" | "card";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[12px] leading-none font-medium whitespace-nowrap tabular-nums",
        tone === "muted" ? "bg-muted text-muted-foreground" : tone === "card" ? "bg-card text-current" : TONE_CLASSES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
