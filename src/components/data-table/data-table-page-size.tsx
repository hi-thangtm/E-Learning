"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PAGE_SIZES } from "@/lib/table-params";
import { useUpdateSearchParams } from "./use-update-search-params";

/** Chọn số dòng mỗi trang (?pageSize=). */
export function DataTablePageSize({ pageSize }: { pageSize: number }) {
  const { update } = useUpdateSearchParams();
  const items = PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }));

  return (
    <Select
      items={items}
      value={String(pageSize)}
      onValueChange={(next) => next && update({ pageSize: String(next) })}
    >
      <SelectTrigger className="w-20" aria-label="Số dòng mỗi trang">
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
