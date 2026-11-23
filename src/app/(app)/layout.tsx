import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { ContentFrame } from "@/components/content-frame";
import { requireUser } from "@/lib/current-user";
import { getBranding } from "@/lib/settings";
import { logoUrl } from "@/lib/settings-meta";

/**
 * Khung chung cho mọi trang sau khi đăng nhập: sidebar trái + header nổi + nội dung.
 * Thông số theo Vuexy vertical layout (docs/design-system.md — mục 4).
 * Trang học viên hỗ trợ điện thoại; trang quản trị giữ bố cục máy tính (cuộn ngang khi màn hình nhỏ) — xem ContentFrame.
 * Thư mục "(app)" có dấu ngoặc nên KHÔNG xuất hiện trên đường dẫn:
 *   src/app/(app)/dashboard/page.tsx  ->  /dashboard
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const branding = await getBranding();

  const brand = { name: branding.name, logoUrl: logoUrl(branding.logoKey) };

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar role={user.role} branding={brand} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} branding={brand} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-4 sm:p-6">
          <ContentFrame>{children}</ContentFrame>
        </main>
      </div>
    </div>
  );
}
