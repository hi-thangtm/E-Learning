import { GraduationCap } from "lucide-react";
import { cn } from "cn";

/** Logo hệ thống: icon + chữ, cỡ chữ theo LogoText của Vuexy (22px, đậm 700). */
export function AppLogo({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <GraduationCap className="size-7 text-primary" strokeWidth={2} />
      <span className="text-[22px] leading-[1.09] font-bold tracking-[0.25px] text-foreground">E-Learning</span>
    </span>
  );
}
