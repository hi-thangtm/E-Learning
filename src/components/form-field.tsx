import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * Bố cục form dùng chung (docs/design-system.md mục 5.3).
 *
 *   <FormGrid cols={2}>
 *     <FormField label="Mã nhân viên" htmlFor="code" required hint="…">…</FormField>
 *     <FormField label="Họ tên" htmlFor="name" required>…</FormField>
 *     <FormField label="Ghi chú" htmlFor="note" span="full">…</FormField>
 *   </FormGrid>
 *
 * Quy ước: KHÔNG tự viết `grid grid-cols-*` cho form — luôn dùng FormGrid (items-start) + FormField,
 * để chú thích / lỗi của một ô không đẩy lệch ô cùng hàng.
 */

const COLS = { 1: "", 2: "grid-cols-2", 3: "grid-cols-3" } as const;

/** Lưới form: căn theo mép trên (items-start), giữa các ô 16px dọc / 24px ngang. */
export function FormGrid({
  cols = 1,
  className,
  children,
}: {
  cols?: keyof typeof COLS;
  className?: string;
  children: ReactNode;
}) {
  return <div className={cn("grid items-start gap-x-6 gap-y-4", COLS[cols], className)}>{children}</div>;
}

/**
 * Một ô trong form, cấu trúc cố định: nhãn (cao 1 dòng, dấu * cùng dòng) → ô nhập → chú thích / lỗi.
 * `content-start`: dù bị lưới kéo cao, phần thừa nằm dưới cùng, nhãn và ô nhập không bị đẩy xuống.
 * Ô nhập bên trong nên đặt `aria-invalid={!!error}` để viền chuyển màu lỗi.
 */
export function FormField({
  label,
  htmlFor,
  error,
  hint,
  required,
  span,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /** "full" = chiếm cả hàng trong FormGrid */
  span?: "full";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid min-w-0 content-start gap-1", span === "full" && "col-span-full", className)}>
      <Label
        htmlFor={htmlFor}
        title={label}
        className="block h-5 truncate text-[13px] leading-5 font-normal whitespace-nowrap text-foreground"
      >
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
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
