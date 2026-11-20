"use client";

import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { MENU, findMenuItem } from "@/lib/roles";

/** Vị trí trang hiện tại trên header: "Nhóm menu › Mục menu". */
export function HeaderBreadcrumb() {
  const pathname = usePathname();
  const item = findMenuItem(pathname);
  if (!item) return <span />;

  const group = MENU.find((g) => g.items.some((i) => i.href === item.href));

  return (
    <nav aria-label="Vị trí trang" className="flex min-w-0 items-center gap-1.5 text-[15px]">
      {group && group.label !== item.label && (
        <>
          <span className="truncate text-muted-foreground">{group.label}</span>
          <ChevronRight className="size-4 shrink-0 text-foreground/40" />
        </>
      )}
      <span className="truncate font-medium text-foreground">{item.label}</span>
    </nav>
  );
}
