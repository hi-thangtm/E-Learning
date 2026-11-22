import { signOut } from "@/auth";
import type { CurrentUser } from "@/lib/current-user";
import { ROLE_LABELS } from "@/lib/roles";
import { getUnreadCount } from "@/lib/notifications";
import { HeaderBreadcrumb } from "@/components/header-breadcrumb";
import { NotificationBell } from "@/components/notification-bell";
import { QuickSearch } from "@/components/quick-search/quick-search";
import { UserMenu } from "@/components/user-menu";

/**
 * Header kiểu "nổi" của Vuexy (docs/design-system.md — mục 4.2):
 * cao 54px, tách khỏi mép, bo 6px, nền trắng mờ, bóng nhẹ, dính trên cùng khi cuộn.
 */
export async function AppHeader({ user }: { user: CurrentUser }) {
  // Số thông báo chưa đọc lúc render; chuông tự cập nhật sau đó (mỗi 60 giây / khi quay lại tab)
  const unread = await getUnreadCount(user.id);

  async function logout() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <header className="sticky top-0 z-10 px-6 pt-4">
      {/* Lớp mờ phía sau để nội dung cuộn bên dưới không lộ rõ qua khe trên header */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-background/70 via-background/45 to-transparent backdrop-blur-[10px] [mask-image:linear-gradient(black,black_18%,transparent)]"
      />
      <div className="relative mx-auto flex h-[54px] max-w-[1392px] items-center justify-between gap-4 rounded-md bg-card/90 px-4 shadow-sm backdrop-blur-[6px]">
        <HeaderBreadcrumb />
        <div className="flex items-center gap-2">
        {/* Tìm nhanh (Ctrl + K): mọi vai trò trừ Học viên */}
        {user.role !== "LEARNER" && <QuickSearch />}
        <NotificationBell initialCount={unread} />
        <UserMenu
          fullName={user.fullName}
          employeeCode={user.employeeCode}
          avatarUrl={user.avatarUrl}
          roleLabel={ROLE_LABELS[user.role]}
          companyName={user.company.name}
          logout={logout}
        />
        </div>
      </div>
    </header>
  );
}
