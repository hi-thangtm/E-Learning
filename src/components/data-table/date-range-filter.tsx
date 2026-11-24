"use client";

import { DatePicker } from "@/components/date-picker";
import { useUpdateSearchParams } from "./use-update-search-params";

/**
 * Lọc khoảng ngày: 2 ô “Từ … / Đến …” ghi tham số `from` / `to` (yyyy-MM-dd) lên URL.
 * Giá trị mặc định do server tính (VD: 30 ngày gần nhất) truyền vào để hiển thị.
 * Ô chọn ngày riêng (dd/MM/yyyy, lịch tiếng Việt) + nhãn “Từ / Đến” nhìn thấy được (ui-review #70).
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
      <DatePicker label="Từ" aria-label="Từ ngày" value={from} max={to} onChange={(v) => v && update({ [fromParam]: v })} />
      <DatePicker label="Đến" aria-label="Đến ngày" value={to} min={from} onChange={(v) => v && update({ [toParam]: v })} />
    </div>
  );
}
