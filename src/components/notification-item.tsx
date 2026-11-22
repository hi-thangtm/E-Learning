"use client";

import type { ReactNode } from "react";
import { formatDateTime, formatRelative } from "@/lib/format";
import { notificationMeta, TONE_ICON_CLASSES, type NotificationView } from "@/lib/notification-types";
import { cn } from "@/lib/utils";

/**
 * 1 dòng thông báo — dùng chung cho dropdown chuông và trang /notifications.
 * Chưa đọc: nền tím nhạt + chấm tím. Bấm dòng -> `onOpen` (đánh dấu đã đọc rồi chuyển tới link).
 */
export function NotificationItem({
  item,
  onOpen,
  disabled,
  actions,
  className,
}: {
  item: NotificationView;
  onOpen: (item: NotificationView) => void;
  disabled?: boolean;
  /** Nút thêm bên phải (trang danh sách: "Đánh dấu đã đọc") */
  actions?: ReactNode;
  className?: string;
}) {
  const meta = notificationMeta(item.type);
  const Icon = meta.icon;

  return (
    <div className={cn("flex items-start gap-3 transition-colors", !item.read && "bg-primary/8", className)}>
      <button
        type="button"
        onClick={() => onOpen(item)}
        disabled={disabled}
        className="flex min-w-0 flex-1 items-start gap-3 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-60"
      >
        <span className={cn("flex size-[38px] shrink-0 items-center justify-center rounded-full", TONE_ICON_CLASSES[meta.tone])}>
          <Icon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[15px] text-foreground", !item.read && "font-medium")}>{item.title}</span>
          {/* Thời gian tương đối tính theo giờ lúc hiển thị: server và trình duyệt có thể lệch vài giây */}
          <span
            className="mt-0.5 block text-[13px] text-muted-foreground"
            title={formatDateTime(item.createdAt)}
            suppressHydrationWarning
          >
            {meta.label} · {formatRelative(item.createdAt)}
          </span>
        </span>
        {!item.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary" aria-label="Chưa đọc" />}
      </button>
      {actions}
    </div>
  );
}
