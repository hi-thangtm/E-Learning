"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Role } from "@prisma/client";
import {
  Award,
  BadgeCheck,
  BookOpen,
  Briefcase,
  Building2,
  FileText,
  FolderTree,
  LayoutDashboard,
  Library,
  ListChecks,
  Network,
  Route,
  ScrollText,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { findMenuItem, menuForRole, type IconName } from "@/lib/roles";
import { AppLogo } from "@/components/app-logo";

const ICONS: Record<IconName, LucideIcon> = {
  dashboard: LayoutDashboard,
  courses: BookOpen,
  paths: Route,
  library: Library,
  certificate: Award,
  team: Users,
  members: UserCog,
  content: FileText,
  questions: ListChecks,
  categories: FolderTree,
  assign: Send,
  rules: ShieldCheck,
  users: Users,
  departments: Network,
  positions: Briefcase,
  reports: TrendingUp,
  companies: Building2,
  template: BadgeCheck,
  audit: ScrollText,
  settings: Settings,
};

/**
 * Sidebar theo Vuexy vertical layout (docs/design-system.md — mục 4.1):
 * rộng 260px, nền card, bóng nhẹ; mục menu 8px 12px bo 6px; mục đang chọn nền gradient primary.
 */
export function AppSidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const activeHref = findMenuItem(pathname)?.href;
  const groups = menuForRole(role);
  // Hiện dải mờ dưới logo khi danh sách menu đã cuộn (như Vuexy)
  const [scrolled, setScrolled] = useState(false);

  return (
    <aside className="sticky top-0 z-20 flex h-screen w-[260px] shrink-0 flex-col bg-sidebar text-sidebar-foreground shadow-sm">
      <div className="relative flex h-16 shrink-0 items-center pr-4 pl-[22px]">
        <Link href="/dashboard" aria-label="Về trang tổng quan">
          <AppLogo />
        </Link>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 top-full z-10 h-8 bg-linear-to-b from-sidebar to-transparent transition-opacity",
            scrolled ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      <nav
        aria-label="Menu chính"
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 0)}
        className="flex-1 overflow-y-auto px-4 pt-1 pb-4"
      >
        {groups.map((group, index) => (
          <div key={group.label}>
            <p
              className={cn(
                "px-3 py-1.5 text-[13px] leading-[1.38] tracking-[0.4px] text-foreground/45 uppercase",
                index === 0 ? "mt-1" : "mt-3.5",
              )}
            >
              {group.label}
            </p>
            <ul className="space-y-1.5">
              {group.items.map((item) => {
                const Icon = ICONS[item.icon];
                const active = item.href === activeHref;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-[15px] leading-[1.47] transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        active
                          ? "bg-linear-to-l from-primary/70 to-primary text-primary-foreground shadow-primary-sm"
                          : "text-sidebar-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <Icon className="size-[22px] shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
