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
            className="px-6 py-4"
            actions={
              !n.read ? (
                <Button variant="ghost" size="sm" onClick={() => markOne(n.id)} disabled={pending} className="shrink-0">
                  <Check />
                  Đánh dấu đã đọc
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
      variant="secondary"
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
