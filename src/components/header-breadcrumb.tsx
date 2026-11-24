"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { MENU, findMenuItem } from "@/lib/roles";

/** Trang không có trong MENU (ui-review #69). */
const STANDALONE: Record<string, string> = {
  "/notifications": "Thông báo",
  "/change-password": "Đổi mật khẩu",
  "/help": "Hướng dẫn sử dụng",
};

/** Trang con của 1 mục menu → cấp 3 (cùng tên với tiêu đề trang). */
// ":id" khớp 1 đoạn bất kỳ; mẫu cố định đặt trước mẫu ":id" cùng cấp
const SUBPAGES: [string, string][] = [
  ["/assign/manual/new", "Giao khoá học / lộ trình"],
  ["/assign/rules/new", "Tạo quy tắc"],
  ["/assign/rules/:id", "Sửa quy tắc"],
  ["/content/courses/:id", "Soạn khoá học"],
  ["/content/paths/:id", "Soạn lộ trình"],
  ["/content/questions/import", "Import câu hỏi"],
  ["/learning-paths/:id", "Chi tiết lộ trình"],
  ["/library/:id", "Giới thiệu khoá học"],
  ["/my-courses/:id/updates", "Có gì thay đổi"],
  ["/my-courses/:id", "Giới thiệu khoá học"],
  ["/org/users/import", "Import nhân viên"],
  ["/org/users/:id", "Chi tiết người dùng"],
  ["/team/members/:id", "Chi tiết nhân viên"],
];

function matches(pattern: string, pathname: string): boolean {
  const a = pattern.split("/");
  const b = pathname.split("/");
  return a.length === b.length && a.every((seg, i) => seg === ":id" || seg === b[i]);
}

/** Vị trí trang hiện tại trên header: "Nhóm menu › Mục menu › Trang con". Điện thoại chỉ hiện cấp cuối. */
export function HeaderBreadcrumb() {
  const pathname = usePathname();
  const standalone = STANDALONE[pathname];
  if (standalone) return <Trail crumbs={[{ label: standalone }]} />;

  const item = findMenuItem(pathname);
  if (!item) return <span />;

  const group = MENU.find((g) => g.items.some((i) => i.href === item.href));
  const sub = pathname !== item.href ? SUBPAGES.find(([p]) => matches(p, pathname))?.[1] : undefined;

  return (
    <Trail
      crumbs={[
        ...(group && group.label !== item.label ? [{ label: group.label }] : []),
        sub ? { label: item.label, href: item.href } : { label: item.label },
        ...(sub ? [{ label: sub }] : []),
      ]}
    />
  );
}

function Trail({ crumbs }: { crumbs: { label: string; href?: string }[] }) {
  return (
    <nav aria-label="Vị trí trang" className="flex min-w-0 items-center gap-1.5 text-[15px]">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1;
        return last ? (
          <span key={i} aria-current="page" className="truncate font-medium text-foreground">
            {c.label}
          </span>
        ) : (
          <span key={i} className="hidden min-w-0 items-center gap-1.5 sm:flex">
            {c.href ? (
              <Link href={c.href} className="truncate text-muted-foreground hover:text-primary">
                {c.label}
              </Link>
            ) : (
              <span className="truncate text-muted-foreground">{c.label}</span>
            )}
            <ChevronRight className="size-4 shrink-0 text-foreground/40" />
          </span>
        );
      })}
    </nav>
  );
}
