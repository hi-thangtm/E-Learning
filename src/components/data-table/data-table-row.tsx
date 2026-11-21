"use client";

import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Dòng bảng bấm được: click hoặc Enter → mở `href` (giữ vị trí cuộn).
 * Bấm vào link / nút / ô nhập bên trong dòng thì để phần tử đó tự xử lý.
 */
export function DataTableRow({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const router = useRouter();

  function isInteractive(target: EventTarget | null) {
    return target instanceof Element && !!target.closest("a, button, input, select, textarea, [role='button']");
  }

  function open(e: MouseEvent<HTMLTableRowElement>) {
    if (isInteractive(e.target)) return;
    // Ctrl/⌘ + click: mở tab mới như link thường
    if (e.metaKey || e.ctrlKey) {
      window.open(href, "_blank");
      return;
    }
    router.push(href, { scroll: false });
  }

  function onKeyDown(e: KeyboardEvent<HTMLTableRowElement>) {
    if (e.key === "Enter" && !isInteractive(e.target) && e.target === e.currentTarget) {
      e.preventDefault();
      router.push(href, { scroll: false });
    }
  }

  return (
    <tr
      tabIndex={0}
      onClick={open}
      onKeyDown={onKeyDown}
      className={cn(
        "cursor-pointer outline-none focus-visible:bg-primary/8 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
        className,
      )}
    >
      {children}
    </tr>
  );
}
