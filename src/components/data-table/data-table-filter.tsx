"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useUpdateSearchParams } from "./use-update-search-params";

export type FilterOption = { value: string; label: string };

const ALL = "__all__";

/**
 * Ô chọn lọc: đổi tham số `param` trên URL.
 * - Mặc định có mục "Tất cả" (= xoá tham số).
 * - `includeAll={false}`: không có "Tất cả", khi URL chưa có tham số thì hiện `defaultValue` (VD: ô chọn công ty).
 */
export function DataTableFilter({
  param,
  label,
  options,
  allLabel,
  includeAll = true,
  defaultValue,
  className,
}: {
  param: string;
  label: string;
  options: FilterOption[];
  allLabel?: string;
  includeAll?: boolean;
  defaultValue?: string;
  className?: string;
}) {
  const { update, searchParams } = useUpdateSearchParams();
  const current = searchParams.get(param);
  const fallback = includeAll ? ALL : (defaultValue ?? options[0]?.value ?? "");
  const value = current && options.some((o) => o.value === current) ? current : fallback;
  const items = includeAll
    ? [{ value: ALL, label: allLabel ?? `Tất cả ${label.toLowerCase()}` }, ...options]
    : options;

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => update({ [param]: !next || next === ALL ? null : String(next) })}
    >
      <SelectTrigger className={cn("w-full", className)} aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
