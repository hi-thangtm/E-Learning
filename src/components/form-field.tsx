import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Một ô trong form: nhãn phía trên, gợi ý / lỗi phía dưới (docs/design-system.md mục 3.4 & 5.3).
 * Ô nhập bên trong nên đặt `aria-invalid={!!error}` để viền chuyển màu lỗi.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid gap-1", className)}>
      <Label htmlFor={htmlFor} className="text-[13px] font-normal text-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[13px] tracking-[0.4px] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
