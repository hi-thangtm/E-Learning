import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";
import { requireUser } from "@/lib/current-user";
import { getBranding } from "@/lib/settings";
import { logoUrl } from "@/lib/settings-meta";

/**
 * Khung chung cho mọi trang sau khi đăng nhập: sidebar trái + header nổi + nội dung.
 * Thông số theo Vuexy vertical layout (docs/design-system.md — mục 4).
 * Thư mục "(app)" có dấu ngoặc nên KHÔNG xuất hiện trên đường dẫn:
 *   src/app/(app)/dashboard/page.tsx  ->  /dashboard
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const branding = await getBranding();

  return (
    <div className="flex min-h-screen min-w-[1200px] bg-background">
      <AppSidebar role={user.role} branding={{ name: branding.name, logoUrl: logoUrl(branding.logoKey) }} />
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader user={user} />
        <main className="mx-auto w-full max-w-[1440px] flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
