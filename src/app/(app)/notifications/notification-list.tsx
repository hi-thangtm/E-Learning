"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { NotificationItem } from "@/components/notification-item";
import { Button } from "@/components/ui/button";
import type { NotificationView } from "@/lib/notification-types";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

/** Danh sách thông báo của trang /notifications: bấm dòng -> đã đọc + mở link; nút đánh dấu từng dòng. */
export function NotificationList({ items }: { items: NotificationView[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function open(item: NotificationView) {
    startTransition(async () => {
      try {
        const r = await markNotificationReadAction(item.id);
        if (r.link) router.push(r.link);
        else router.refresh();
      } catch {
        toast.error("Không mở được thông báo, vui lòng thử lại.");
      }
    });
  }

  function markOne(id: string) {
    startTransition(async () => {
      try {
        await markNotificationReadAction(id);
        router.refresh();
      } catch {
        toast.error("Không đánh dấu được, vui lòng thử lại.");
      }
    });
  }

  return (
    <ul>
      {items.map((n) => (
        <li key={n.id} className="border-b border-border last:border-0">
          <NotificationItem
            item={n}
            onOpen={open}
            disabled={pending}
            className="px-4 py-4 sm:px-6"
            actions={
              !n.read ? (
                // Điện thoại: chỉ icon (40px) để nội dung thông báo không bị ép thành cột hẹp (ui-review #2)
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => markOne(n.id)}
                  disabled={pending}
                  aria-label="Đánh dấu đã đọc"
                  title="Đánh dấu đã đọc"
                  className="size-10 shrink-0 px-0 sm:size-auto sm:px-2.5"
                >
                  <Check />
                  <span className="hidden sm:inline">Đánh dấu đã đọc</span>
                </Button>
              ) : null
            }
          />
        </li>
      ))}
    </ul>
  );
}

/** Nút "Đánh dấu tất cả đã đọc" ở đầu trang. */
export function MarkAllReadButton({ disabled }: { disabled: boolean }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="outline"
      disabled={disabled || pending}
      onClick={() =>
        startTransition(async () => {
          try {
            const r = await markAllNotificationsReadAction();
            toast.success(r.count > 0 ? `Đã đánh dấu ${r.count} thông báo là đã đọc.` : "Không còn thông báo chưa đọc.");
            router.refresh();
          } catch {
            toast.error("Không đánh dấu được, vui lòng thử lại.");
          }
        })
      }
    >
      <CheckCheck />
      Đánh dấu tất cả đã đọc
    </Button>
  );
}
