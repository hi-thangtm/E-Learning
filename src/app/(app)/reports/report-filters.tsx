"use client";

import { DateRangeFilter } from "@/components/data-table/date-range-filter";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { useUpdateSearchParams } from "@/components/data-table/use-update-search-params";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

type Option = { value: string; label: string };

/** Thanh bộ lọc chung của Báo cáo — mọi giá trị nằm trên URL (searchParams). */
export function ReportFilters({
  companies,
  departments,
  categories,
  from,
  to,
  includeSub,
  includeSelf,
  hasDepartment,
}: {
  /** Chỉ Admin tập đoàn */
  companies: Option[] | null;
  departments: Option[];
  categories: Option[];
  from: string;
  to: string;
  includeSub: boolean;
  includeSelf: boolean;
  hasDepartment: boolean;
}) {
  const { update, pending } = useUpdateSearchParams();
  const KEEP = ["tab", "window", "cumulative"];

  return (
    <section className="rounded-md bg-card p-6 shadow-md" aria-busy={pending}>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium text-foreground">Bộ lọc</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            const reset: Record<string, null> = {};
            for (const k of ["company", "department", "sub", "category", "from", "to", "self", "q", "sort", "dir", "course"]) {
              if (!KEEP.includes(k)) reset[k] = null;
            }
            update(reset);
          }}
        >
          Xoá bộ lọc
        </Button>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {companies && <DataTableFilter param="company" label="Công ty" allLabel="Toàn tập đoàn" options={companies} />}
        <div className="grid gap-2">
          <DataTableFilter param="department" label="Phòng ban" allLabel="Mọi phòng ban" options={departments} />
          {hasDepartment && (
            <label className="flex items-center gap-2 text-[13px] text-foreground">
              <Switch checked={includeSub} onCheckedChange={(v) => update({ sub: v ? null : "0" })} />
              Gồm phòng con
            </label>
          )}
        </div>
        <DataTableFilter param="category" label="Danh mục" allLabel="Mọi danh mục" options={categories} />
        <div className="grid gap-2">
          <DateRangeFilter from={from} to={to} />
          <p className="text-[12px] text-muted-foreground">Theo ngày giao khoá</p>
        </div>
        <label className="flex items-center gap-2 self-start pt-2 text-[15px] text-foreground">
          <Switch checked={includeSelf} onCheckedChange={(v) => update({ self: v ? "1" : null })} />
          Gồm khoá tự đăng ký
        </label>
      </div>
    </section>
  );
}

/** Công tắc “Cộng dồn phòng con” (tab Theo phòng ban). */
export function CumulativeToggle({ checked }: { checked: boolean }) {
  const { update } = useUpdateSearchParams();
  return (
    <label className="flex items-center gap-2 text-[15px] whitespace-nowrap text-foreground">
      <Switch checked={checked} onCheckedChange={(v) => update({ cumulative: v ? "1" : null })} />
      Cộng dồn phòng con
    </label>
  );
}
