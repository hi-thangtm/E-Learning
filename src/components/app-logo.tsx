import { GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Logo hệ thống: logo đã tải lên (Cài đặt) hoặc icon mặc định + tên hệ thống. Cỡ chữ theo LogoText của Vuexy (22px, đậm 700).
 * Thuần trình bày — dùng được cả trong component client (sidebar). Lấy `name` / `logoUrl` ở server qua getBranding() (src/lib/settings.ts).
 */
export function AppLogo({ name, logoUrl, className }: { name: string; logoUrl: string | null; className?: string }) {
  return (
    <span className={cn("flex min-w-0 items-center gap-3", className)}>
      {logoUrl ? (
        // Ảnh phục vụ qua route công khai /api/branding/logo (PNG / WEBP) — không cần tối ưu của next/image
        // eslint-disable-next-line @next/next/no-img-element -- logo nhỏ, đã có cache ở route; next/image không cần thiết
        <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] shrink-0 object-contain" />
      ) : (
        <GraduationCap className="size-7 shrink-0 text-primary" strokeWidth={2} />
      )}
      <span className="truncate text-[22px] leading-[1.09] font-bold tracking-[0.25px] text-foreground">{name}</span>
    </span>
  );
}
