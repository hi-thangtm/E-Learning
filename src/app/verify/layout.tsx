import type { Metadata } from "next";
import Link from "next/link";
import { AppLogo } from "@/components/app-logo";
import { getBranding } from "@/lib/settings";
import { logoUrl } from "@/lib/settings-meta";

/** Tra cứu chứng nhận — trang CÔNG KHAI (không cần đăng nhập, không sidebar). Header X-Robots-Tag đặt ở next.config.ts. */
export const metadata: Metadata = {
  title: "Tra cứu chứng nhận",
  robots: { index: false, follow: false },
};

export default async function VerifyLayout({ children }: { children: React.ReactNode }) {
  const branding = await getBranding();
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex h-16 max-w-3xl items-center justify-between px-6">
          <Link href="/verify" aria-label="Tra cứu chứng nhận">
            <AppLogo name={branding.name} logoUrl={logoUrl(branding.logoKey)} />
          </Link>
          <span className="text-[13px] text-muted-foreground">Tra cứu chứng nhận</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-10">{children}</main>
    </div>
  );
}
