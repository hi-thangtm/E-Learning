"use client";

import Link from "next/link";
import { Bell, KeyRound, LogOut } from "lucide-react";
import { Avatar, AvatarBadge, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getInitials } from "@/lib/initials";

type Props = {
  fullName: string;
  employeeCode: string;
  avatarUrl: string | null;
  roleLabel: string;
  companyName: string;
  /** Server action đăng xuất (khai báo ở app-header.tsx) */
  logout: () => Promise<void>;
};

/** Avatar + menu người dùng trên header, theo UserDropdown của Vuexy. */
export function UserMenu({ fullName, employeeCode, avatarUrl, roleLabel, companyName, logout }: Props) {
  const initials = getInitials(fullName);

  const avatar = (size: string) => (
    <Avatar className={size}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={fullName} />}
      <AvatarFallback className="bg-primary/16 text-[15px] font-medium text-primary">{initials}</AvatarFallback>
      <AvatarBadge className="size-2 bg-success ring-card" />
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Tài khoản của tôi"
        className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        {avatar("size-[38px] cursor-pointer")}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" sideOffset={12} className="w-64 rounded-md p-0 py-2 shadow-lg ring-0">
        <div className="flex items-center gap-2 px-6 py-2">
          {avatar("size-[38px]")}
          <div className="min-w-0">
            <p className="truncate text-[15px] font-medium text-foreground">{fullName}</p>
            <p className="truncate text-[13px] text-muted-foreground">
              {employeeCode} · {roleLabel}
            </p>
            <p className="truncate text-[13px] text-muted-foreground">{companyName}</p>
          </div>
        </div>

        <DropdownMenuSeparator className="mx-0 my-1" />

        <DropdownMenuItem
          render={<Link href="/notifications" />}
          className="mx-2 gap-3 rounded-md px-4 py-2 text-[15px] text-foreground"
        >
          <Bell className="size-[22px]" strokeWidth={1.75} />
          Thông báo
        </DropdownMenuItem>

        <DropdownMenuItem
          render={<Link href="/change-password" />}
          className="mx-2 gap-3 rounded-md px-4 py-2 text-[15px] text-foreground"
        >
          <KeyRound className="size-[22px]" strokeWidth={1.75} />
          Đổi mật khẩu
        </DropdownMenuItem>

        <form action={logout} className="px-3 pt-2 pb-1">
          <Button type="submit" size="sm" variant="destructive" className="w-full">
            Đăng xuất
            <LogOut data-icon="inline-end" />
          </Button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
