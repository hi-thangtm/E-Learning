"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, BellRing } from "lucide-react";
import { ProgressBar } from "@/components/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPercent } from "@/lib/format";
import { getInitials } from "@/lib/initials";
import { cn } from "@/lib/utils";
import type { SortKey } from "./query";
import { RemindDialog } from "./remind-dialog";
import type { MemberSelection } from "./types";

export type MemberTableRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  avatarUrl: string | null;
  departmentName: string | null;
  positionName: string | null;
  assigned: number;
  completed: number;
  inProgress: number;
  overdue: number;
  unacknowledged: number;
  rate: number | null;
};

const NUM_COLUMNS: { key: Exclude<SortKey, "name" | "rate">; label: string; tone?: (v: number) => string }[] = [
  { key: "assigned", label: "Được giao" },
  { key: "completed", label: "Đã xong" },
  { key: "inProgress", label: "Đang học" },
  { key: "overdue", label: "Quá hạn", tone: (v) => (v > 0 ? "font-medium text-destructive" : "") },
  { key: "unacknowledged", label: "Chưa nắm quy trình mới", tone: (v) => (v > 0 ? "font-medium text-warning" : "") },
];

/** Bảng Nhân viên: tích chọn từng người / cả trang / tất cả theo bộ lọc → “Nhắc nhở”. Sắp xếp bằng link (searchParams). */
export function MembersTable({ rows, total }: { rows: MemberTableRow[]; total: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [allByFilter, setAllByFilter] = useState(false);

  const sort = searchParams.get("sort") ?? "name";
  const dir = searchParams.get("dir") === "desc" ? "desc" : "asc";
  const pageIds = rows.map((r) => r.id);
  const allPageChecked = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const count = allByFilter ? total : selected.size;

  const selection: MemberSelection = useMemo(() => {
    if (!allByFilter) return { mode: "ids", ids: [...selected] };
    const params: Record<string, string> = {};
    searchParams.forEach((v, k) => {
      if (k !== "page" && k !== "pageSize") params[k] = v;
    });
    return { mode: "filter", params };
  }, [allByFilter, selected, searchParams]);

  function sortHref(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString());
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc";
    params.set("sort", key);
    params.set("dir", nextDir);
    params.delete("page");
    return `${pathname}?${params.toString()}`;
  }

  function toggle(id: string) {
    setAllByFilter(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage() {
    setAllByFilter(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageChecked) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function clear() {
    setSelected(new Set());
    setAllByFilter(false);
  }

  const sortIcon = (key: SortKey) =>
    sort === key ? dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />;

  return (
    <div>
      {/* Thanh chọn */}
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-y border-border bg-muted/40 px-6 py-2">
        <p className="text-[13px] text-muted-foreground">
          {count > 0 ? (
            <>
              Đã chọn <b className="font-medium text-foreground">{formatNumber(count)}</b> người
              {allByFilter ? " (tất cả theo bộ lọc)" : ""}
              {!allByFilter && allPageChecked && total > rows.length && (
                <>
                  {" · "}
                  <button type="button" className="text-primary hover:underline" onClick={() => setAllByFilter(true)}>
                    Chọn tất cả {formatNumber(total)} người theo bộ lọc
                  </button>
                </>
              )}
              {" · "}
              <button type="button" className="text-primary hover:underline" onClick={clear}>
                Bỏ chọn
              </button>
            </>
          ) : (
            "Tích chọn nhân viên để gửi nhắc nhở."
          )}
        </p>
        <RemindDialog
          selection={selection}
          targetLabel={allByFilter ? `${formatNumber(total)} người theo bộ lọc` : `${formatNumber(selected.size)} người đã chọn`}
          onSent={clear}
          trigger={
            <Button size="sm" disabled={count === 0}>
              <BellRing />
              Gửi nhắc nhở
            </Button>
          }
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border text-left text-[13px] font-medium text-foreground uppercase">
              <th className="w-12 px-6 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label="Chọn cả trang"
                  checked={allByFilter || allPageChecked}
                  onChange={togglePage}
                  disabled={rows.length === 0}
                />
              </th>
              <th className="px-3 py-3">
                <Link href={sortHref("name")} scroll={false} className="inline-flex items-center gap-1 hover:text-primary">
                  Nhân viên {sortIcon("name")}
                </Link>
              </th>
              <th className="px-3 py-3">Phòng ban</th>
              <th className="px-3 py-3">Chức danh</th>
              {NUM_COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-3 text-right">
                  <Link href={sortHref(c.key)} scroll={false} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary">
                    {c.label} {sortIcon(c.key)}
                  </Link>
                </th>
              ))}
              <th className="w-40 min-w-40 px-6 py-3">
                <Link href={sortHref("rate")} scroll={false} className="inline-flex items-center gap-1 whitespace-nowrap hover:text-primary">
                  Tỷ lệ {sortIcon("rate")}
                </Link>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={cn("border-b border-border last:border-0 hover:bg-muted/40", selected.has(r.id) && "bg-primary/5")}>
                <td className="px-6 py-3">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    aria-label={`Chọn ${r.fullName}`}
                    checked={allByFilter || selected.has(r.id)}
                    disabled={allByFilter}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td className="px-3 py-3">
                  <Link href={`/team/members/${r.id}`} className="group flex items-center gap-3">
                    <Avatar className="size-9">
                      {r.avatarUrl && <AvatarImage src={r.avatarUrl} alt="" />}
                      <AvatarFallback className="bg-primary/16 text-[13px] font-medium text-primary">{getInitials(r.fullName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0">
                      <span className="block max-w-48 truncate font-medium text-foreground group-hover:text-primary" title={r.fullName}>
                        {r.fullName}
                      </span>
                      <span className="text-[13px] text-muted-foreground">{r.employeeCode}</span>
                    </span>
                  </Link>
                </td>
                {/* Tên phòng / chức danh dài: cắt 1 dòng + title (ui-review #52) */}
                <td className="px-3 py-3 text-muted-foreground">
                  <span className="block max-w-48 truncate" title={r.departmentName ?? undefined}>
                    {r.departmentName ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  <span className="block max-w-40 truncate" title={r.positionName ?? undefined}>
                    {r.positionName ?? "—"}
                  </span>
                </td>
                {NUM_COLUMNS.map((c) => (
                  <td key={c.key} className={cn("px-3 py-3 text-right tabular-nums", c.tone?.(r[c.key]))}>
                    {formatNumber(r[c.key])}
                  </td>
                ))}
                <td className="px-6 py-3">
                  {r.rate === null ? (
                    <span className="text-[13px] text-foreground/45">Chưa được giao</span>
                  ) : (
                    <div className="flex items-center gap-2">
                      <ProgressBar value={r.rate} className="w-20" label={`Tỷ lệ hoàn thành của ${r.fullName}`} />
                      <span className="text-[13px] tabular-nums">{formatPercent(r.rate, 0)}</span>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
