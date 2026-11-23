"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/enrollment-labels";
import { formatNumber } from "@/lib/format";
import { flattenTree } from "@/lib/tree";
import { searchLearnersAction } from "./actions";
import type { DepartmentOption, LearnerFilter, LearnerRow, Option, Selection, WizardCourse } from "./types";
import { Tooltip } from "@/components/ui/tooltip";

const ALL = "__all__";

/**
 * Bước 3 — chọn học viên: lọc công ty / phòng ban (gồm phòng con) / chức danh / tìm kiếm,
 * tích từng người, chọn cả trang, hoặc “Chọn tất cả N người theo bộ lọc”.
 */
export function LearnerPicker({
  course,
  companies,
  departments,
  positions,
  selection,
  onChange,
}: {
  course: WizardCourse;
  companies: Option[];
  departments: DepartmentOption[];
  positions: Option[];
  selection: Selection;
  onChange: (selection: Selection) => void;
}) {
  // Công ty chọn được theo phạm vi khoá
  const allowedCompanies = useMemo(
    () => (course.learnerCompanies === "all" ? companies : companies.filter((c) => course.learnerCompanies.includes(c.id))),
    [companies, course.learnerCompanies],
  );
  const fixedCompany = allowedCompanies.length === 1 ? allowedCompanies[0].id : "";

  const [filter, setFilter] = useState<LearnerFilter>({ companyId: fixedCompany, departmentId: "", positionId: "", q: "" });
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<{ rows: LearnerRow[]; total: number; pageSize: number } | null>(null);
  const [loading, startLoading] = useTransition();

  // Tìm kiếm: chờ người dùng gõ xong
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => (f.q === query.trim() ? f : { ...f, q: query.trim() }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    startLoading(async () => {
      try {
        const r = await searchLearnersAction({ kind: course.kind, id: course.id }, filter, page);
        if (r.ok) setResult({ rows: r.rows, total: r.total, pageSize: r.pageSize });
        else toast.error(r.message);
      } catch {
        toast.error("Không tải được danh sách học viên.");
      }
    });
  }, [course.kind, course.id, filter, page]);

  const departmentItems = useMemo(() => {
    const rows = departments.filter((d) => d.companyId === filter.companyId);
    return flattenTree(rows, "all").map(({ row, depth }) => ({ id: row.id, label: `${"   ".repeat(depth)}${row.name}` }));
  }, [departments, filter.companyId]);

  const setF = (patch: Partial<LearnerFilter>) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const ids = selection.mode === "ids" ? new Set(selection.ids) : null;
  const rows = result?.rows ?? [];
  const pageAllChecked = !!ids && rows.length > 0 && rows.every((r) => ids.has(r.id));
  const pageCount = result ? Math.max(1, Math.ceil(result.total / result.pageSize)) : 1;

  function toggle(id: string) {
    const next = new Set(ids ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ mode: "ids", ids: [...next] });
  }

  function togglePage() {
    const next = new Set(ids ?? []);
    if (pageAllChecked) rows.forEach((r) => next.delete(r.id));
    else rows.forEach((r) => next.add(r.id));
    onChange({ mode: "ids", ids: [...next] });
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-4 gap-4">
        <FilterSelect
          label="Công ty"
          value={filter.companyId}
          allLabel={allowedCompanies.length > 1 ? "Mọi công ty" : null}
          options={allowedCompanies}
          onChange={(v) => setF({ companyId: v, departmentId: "" })}
        />
        <FilterSelect
          label="Phòng ban"
          value={filter.departmentId}
          allLabel={filter.companyId ? "Mọi phòng ban" : "Chọn công ty trước"}
          options={departmentItems}
          disabled={!filter.companyId}
          onChange={(v) => setF({ departmentId: v })}
        />
        <FilterSelect label="Chức danh" value={filter.positionId} allLabel="Mọi chức danh" options={positions} onChange={(v) => setF({ positionId: v })} />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm tên, mã NV..." aria-label="Tìm học viên" className="pl-9" />
        </div>
      </div>

      {/* Thanh trạng thái chọn */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/50 px-4 py-2.5 text-[15px]">
        {selection.mode === "filter" ? (
          <span className="text-foreground">
            Đã chọn <strong className="font-medium">tất cả người khớp bộ lọc</strong>
            {selection.filter.q || selection.filter.departmentId || selection.filter.positionId || selection.filter.companyId ? " (theo bộ lọc lúc bấm chọn)" : ""}.
          </span>
        ) : (
          <span className="text-foreground">
            Đã chọn <strong className="font-medium">{formatNumber(selection.ids.length)}</strong> người
          </span>
        )}
        <div className="flex gap-2">
          {result && result.total > 0 && selection.mode === "ids" && (
            <Button type="button" variant="outline" size="sm" onClick={() => onChange({ mode: "filter", filter: { ...filter } })}>
              Chọn tất cả {formatNumber(result.total)} người theo bộ lọc
            </Button>
          )}
          {(selection.mode === "filter" || selection.ids.length > 0) && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ mode: "ids", ids: [] })}>
              <X />
              Bỏ chọn
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[13px] text-foreground uppercase">
              <th className="w-12 px-4 py-3">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  aria-label="Chọn cả trang"
                  checked={selection.mode === "filter" || pageAllChecked}
                  disabled={selection.mode === "filter" || rows.length === 0}
                  onChange={togglePage}
                />
              </th>
              <th className="px-4 py-3 font-medium">Học viên</th>
              <th className="px-4 py-3 font-medium">Công ty</th>
              <th className="px-4 py-3 font-medium">Phòng ban</th>
              <th className="px-4 py-3 font-medium">Chức danh</th>
              <th className="px-4 py-3 font-medium">Khoá này</th>
            </tr>
          </thead>
          <tbody className={loading ? "opacity-60" : undefined}>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-muted-foreground">
                  {loading ? "Đang tải..." : "Không có học viên nào khớp bộ lọc."}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const checked = selection.mode === "filter" || !!ids?.has(r.id);
                return (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`Chọn ${r.fullName}`}
                        checked={checked}
                        disabled={selection.mode === "filter"}
                        onChange={() => toggle(r.id)}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="block text-foreground">{r.fullName}</span>
                      <span className="text-[13px] text-muted-foreground">{r.employeeCode}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.companyCode}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.departmentName ?? "—"}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{r.positionName ?? "—"}</td>
                    <td className="px-4 py-2.5">
                      {course.kind === "path" ? (
                        r.pathState === "DONE" ? (
                          <StatusBadge tone="success">Đã xong lộ trình</StatusBadge>
                        ) : r.pathState === "HAS" ? (
                          <StatusBadge tone="info">Đã có lộ trình</StatusBadge>
                        ) : (
                          <span className="text-[13px] text-foreground/45">Chưa giao</span>
                        )
                      ) : r.enrollmentStatus ? (
                        <StatusBadge tone={ENROLLMENT_STATUS_LABELS[r.enrollmentStatus].tone}>
                          {ENROLLMENT_STATUS_LABELS[r.enrollmentStatus].label}
                        </StatusBadge>
                      ) : (
                        <span className="text-[13px] text-foreground/45">Chưa giao</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        {result && result.total > result.pageSize && (
          <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-[13px] text-muted-foreground">
            <span>
              {formatNumber(result.total)} người · trang {page}/{pageCount}
            </span>
            <div className="flex gap-2">
              <Tooltip label="Trang trước"><Button type="button" variant="outline" size="icon-sm" aria-label="Trang trước" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>
                <ChevronLeft />
              </Button></Tooltip>
              <Tooltip label="Trang sau"><Button type="button" variant="outline" size="icon-sm" aria-label="Trang sau" disabled={page >= pageCount || loading} onClick={() => setPage(page + 1)}>
                <ChevronRight />
              </Button></Tooltip>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  allLabel,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  /** null = không có mục “tất cả” (VD chỉ 1 công ty) */
  allLabel: string | null;
  options: Option[];
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const items = [...(allLabel ? [{ value: ALL, label: allLabel }] : []), ...options.map((o) => ({ value: o.id, label: o.label }))];
  return (
    <Select items={items} value={value || (allLabel ? ALL : options[0]?.id ?? ALL)} disabled={disabled} onValueChange={(v) => onChange(!v || v === ALL ? "" : String(v))}>
      <SelectTrigger className="w-full" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
