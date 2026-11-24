"use client";

import { useState } from "react";
import { CalendarDays, X } from "lucide-react";
import { vi } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/** "yyyy-MM-dd" → Date 0 giờ theo giờ máy (chỉ dùng phần ngày, không lệch múi giờ). */
function isoToDate(iso: string | undefined): Date | undefined {
  if (!iso) return undefined;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function dateToIso(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** "yyyy-MM-dd" → "dd/MM/yyyy" */
function isoToText(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Ô chọn ngày (ui-review #70): luôn hiện dd/MM/yyyy và lịch tiếng Việt, không phụ thuộc ngôn ngữ trình duyệt
 * như `<input type="date">`. Giá trị trao đổi là chuỗi "yyyy-MM-dd" (giống input date cũ).
 * - Có điều khiển: `value` + `onChange`. Không điều khiển (form gửi thẳng): `defaultValue` + `name` (input ẩn).
 * - `label` hiện trước ngày trong nút (VD “Từ”), `clearable` cho phép xoá (trường không bắt buộc).
 */
export function DatePicker({
  id,
  name,
  value,
  defaultValue,
  onChange,
  min,
  max,
  label,
  placeholder = "dd/mm/yyyy",
  clearable = false,
  disabled = false,
  invalid = false,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (iso: string) => void;
  min?: string;
  max?: string;
  label?: string;
  placeholder?: string;
  clearable?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value !== undefined ? value : inner;
  const selected = isoToDate(current);
  const minDate = isoToDate(min);
  const maxDate = isoToDate(max);

  function pick(iso: string) {
    if (value === undefined) setInner(iso);
    onChange?.(iso);
    setOpen(false);
  }

  const text = current ? isoToText(current) : placeholder;

  return (
    <>
      {name && <input type="hidden" name={name} value={current} />}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="outline"
              id={id}
              disabled={disabled}
              aria-invalid={invalid || undefined}
              aria-label={ariaLabel ? `${ariaLabel}: ${current ? text : "chưa chọn"}` : undefined}
              className={cn("w-full justify-start gap-2 px-3 font-normal", !current && "text-muted-foreground", className)}
            />
          }
        >
          <CalendarDays className="text-muted-foreground" />
          {label && <span className="text-muted-foreground">{label}</span>}
          <span className={cn("tabular-nums", current && "text-foreground")}>{text}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-0">
          <Calendar
            mode="single"
            locale={vi}
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? minDate ?? maxDate}
            startMonth={minDate ?? new Date(1950, 0)}
            endMonth={maxDate ?? new Date(new Date().getFullYear() + 5, 11)}
            disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
            onSelect={(d) => d && pick(dateToIso(d))}
            autoFocus
          />
          {clearable && current && (
            <div className="border-t border-border p-2">
              <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => pick("")}>
                <X />
                Xoá ngày
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </>
  );
}
