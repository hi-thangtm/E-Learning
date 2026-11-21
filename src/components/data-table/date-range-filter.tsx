"use client";

import { Input } from "@/components/ui/input";
import { useUpdateSearchParams } from "./use-update-search-params";

/**
 * Lọc khoảng ngày: 2 ô “Từ ngày / Đến ngày” ghi tham số `from` / `to` (yyyy-MM-dd) lên URL.
 * Giá trị mặc định do server tính (VD: 30 ngày gần nhất) truyền vào để hiển thị.
 */
export function DateRangeFilter({
  from,
  to,
  fromParam = "from",
  toParam = "to",
}: {
  from: string;
  to: string;
  fromParam?: string;
  toParam?: string;
}) {
  const { update } = useUpdateSearchParams();

  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="grid gap-1">
        <span className="sr-only">Từ ngày</span>
        <Input
          type="date"
          aria-label="Từ ngày"
          title="Từ ngày"
          value={from}
          max={to}
          onChange={(e) => e.target.value && update({ [fromParam]: e.target.value })}
        />
      </label>
      <label className="grid gap-1">
        <span className="sr-only">Đến ngày</span>
        <Input
          type="date"
          aria-label="Đến ngày"
          title="Đến ngày"
          value={to}
          min={from}
          onChange={(e) => e.target.value && update({ [toParam]: e.target.value })}
        />
      </label>
    </div>
  );
}
