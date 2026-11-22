"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, BellOff, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import {
  getLatestNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/(app)/notifications/actions";
import { NotificationItem } from "@/components/notification-item";
import { CountPill } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import type { NotificationView } from "@/lib/notification-types";

const POLL_MS = 60_000;

/**
 * Chuông thông báo trên header: badge số chưa đọc (số ban đầu do server render layout),
 * cập nhật mỗi 60 giây + khi quay lại tab. Mở -> 10 thông báo mới nhất.
 */
export function NotificationBell({ initialCount }: { initialCount: number }) {
  const [count, setCount] = useState(initialCount);
  // Server render lại header (VD sau khi đánh dấu đã đọc ở trang /notifications) -> nhận số mới
  const [seenInitial, setSeenInitial] = useState(initialCount);
  if (seenInitial !== initialCount) {
    setSeenInitial(initialCount);
    setCount(initialCount);
  }
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[] | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const refreshCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { unread?: number };
      if (typeof data.unread === "number") setCount(data.unread);
    } catch {
      // Mất mạng tạm thời: giữ số cũ, lần sau hỏi lại
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refreshCount();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCount();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [refreshCount]);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    // Mỗi lần mở: tải lại 10 thông báo mới nhất
    startTransition(async () => {
      try {
        const r = await getLatestNotificationsAction();
        setItems(r.items);
        setCount(r.unread);
      } catch {
        toast.error("Không tải được thông báo.");
      }
    });
  }

  function openItem(item: NotificationView) {
    startTransition(async () => {
      try {
        const r = await markNotificationReadAction(item.id);
        setCount(r.unread);
        setItems((prev) => prev?.map((n) => (n.id === item.id ? { ...n, read: true } : n)) ?? prev);
        if (r.link) {
          setOpen(false);
          router.push(r.link);
        }
      } catch {
        toast.error("Không mở được thông báo, vui lòng thử lại.");
      }
    });
  }

  function markAll() {
    startTransition(async () => {
      try {
        await markAllNotificationsReadAction();
        setCount(0);
        setItems((prev) => prev?.map((n) => ({ ...n, read: true })) ?? prev);
        router.refresh();
      } catch {
        toast.error("Không đánh dấu được, vui lòng thử lại.");
      }
    });
  }

  const badge = count > 99 ? "99+" : String(count);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full"
            aria-label={count > 0 ? `Thông báo, ${count} chưa đọc` : "Thông báo"}
          >
            <Bell className="size-[22px]" strokeWidth={1.75} />
            {count > 0 && (
              <span className="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive px-1 text-[11px] leading-none font-medium whitespace-nowrap text-white tabular-nums ring-2 ring-card">
                {badge}
              </span>
            )}
          </Button>
        }
      />
      {/* Rộng 380px, căn mép phải với chuông; không bao giờ rộng hơn màn hình (chừa 16px mỗi bên) */}
      <DropdownMenuContent
        align="end"
        sideOffset={12}
        className="w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-md p-0 shadow-lg ring-0"
      >
        {/* 1 hàng: [Thông báo + badge] ......... [Đánh dấu tất cả đã đọc] */}
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="inline-flex min-w-0 items-center gap-2">
            <p className="text-[15px] font-medium whitespace-nowrap text-foreground">Thông báo</p>
            {count > 0 && <CountPill>{badge} mới</CountPill>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={markAll}
            disabled={pending || count === 0}
            className="shrink-0 px-2 text-[13px] whitespace-nowrap"
          >
            <CheckCheck />
            Đánh dấu tất cả đã đọc
          </Button>
        </div>

        <div className="max-h-[420px] overflow-y-auto">
          {items === null ? (
            <div className="grid gap-3 p-4" aria-busy="true" aria-label="Đang tải thông báo">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3">
                  <Skeleton className="size-[38px] rounded-full" />
                  <div className="grid flex-1 gap-1.5">
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <span className="flex size-12 items-center justify-center rounded-full bg-primary/16 text-primary">
                <BellOff className="size-6" />
              </span>
              <p className="text-[15px] text-muted-foreground">Bạn chưa có thông báo nào</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id} className="border-b border-border last:border-0">
                  <NotificationItem item={n} onOpen={openItem} disabled={pending} className="px-4 py-3 hover:bg-muted/60" />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-2">
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex h-[38px] items-center justify-center rounded-md text-[15px] font-medium text-primary hover:bg-primary/8"
          >
            Xem tất cả
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
