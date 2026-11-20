"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DataTableEmpty } from "@/components/data-table/data-table-empty";
import { DataTableFilter, type FilterOption } from "@/components/data-table/data-table-filter";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { flattenTree } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { toggleDepartmentAction } from "./actions";
import { DepartmentFormDialog } from "./department-form-dialog";
import type { DepartmentRow, EmployeeOption } from "./types";

const PATHNAME = "/org/departments";

/**
 * Bảng phòng ban dạng cây: mở / thu từng nhánh, mở tất cả / thu tất cả.
 * Một dialog thêm/sửa dùng chung cho cả cây (không lặp danh sách nhân viên ở từng dòng).
 */
export function DepartmentTree({
  companyId,
  allRows,
  rows,
  matchedIds,
  employees,
  companies,
  companyLabel,
}: {
  companyId: string;
  /** Toàn bộ phòng ban của công ty (để chọn phòng cha) */
  allRows: DepartmentRow[];
  /** Phòng ban hiển thị (đã lọc theo tìm kiếm) */
  rows: DepartmentRow[];
  /** null = không tìm kiếm; mảng = id các phòng khớp từ khoá */
  matchedIds: string[] | null;
  employees: EmployeeOption[];
  /** Danh sách công ty cho ô chọn (chỉ Admin tập đoàn), null = ẩn ô chọn */
  companies: FilterOption[] | null;
  companyLabel: string;
}) {
  const searching = matchedIds !== null;
  const matched = useMemo(() => new Set(matchedIds ?? []), [matchedIds]);
  const parentIds = useMemo(() => new Set(allRows.map((r) => r.parentId).filter(Boolean) as string[]), [allRows]);

  // Lưu các nhánh ĐÃ THU (mặc định rỗng = mở tất cả; nhánh mới thêm cũng tự mở)
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const expanded = useMemo(() => new Set([...parentIds].filter((id) => !collapsed.has(id))), [parentIds, collapsed]);
  const allCollapsed = parentIds.size > 0 && expanded.size === 0;

  // Khi đang tìm kiếm: luôn mở các nhánh dẫn tới kết quả
  const items = flattenTree(rows, searching ? "all" : expanded);

  // Dialog thêm / sửa (dùng chung)
  const [formOpen, setFormOpen] = useState(false);
  const [formTarget, setFormTarget] = useState<DepartmentRow | null>(null);
  const [formKey, setFormKey] = useState(0);

  // Hộp xác nhận ẩn / hiện
  const [toggleOpen, setToggleOpen] = useState(false);
  const [toggleTarget, setToggleTarget] = useState<DepartmentRow | null>(null);

  const rowById = useMemo(() => new Map(allRows.map((r) => [r.id, r])), [allRows]);

  function openForm(target: DepartmentRow | null) {
    setFormTarget(target);
    setFormKey((k) => k + 1);
    setFormOpen(true);
  }

  function requestToggle(row: DepartmentRow) {
    if (row.isActive) {
      const reasons: string[] = [];
      if (row.activeChildren > 0) reasons.push(`${row.activeChildren} phòng con đang dùng`);
      if (row.activeUsers > 0) reasons.push(`${row.activeUsers} nhân viên đang làm`);
      if (reasons.length > 0) {
        toast.error(`Không thể ẩn ${row.code}: còn ${reasons.join(" và ")}.`, {
          description: "Hãy ẩn các phòng con và chuyển nhân viên sang phòng khác trước.",
        });
        return;
      }
    } else {
      const parent = row.parentId ? rowById.get(row.parentId) : undefined;
      if (parent && !parent.isActive) {
        toast.error(`Phòng cha ${parent.code} đang bị ẩn. Hãy hiện phòng cha trước.`);
        return;
      }
    }
    setToggleTarget(row);
    setToggleOpen(true);
  }

  function toggleBranch(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const addButton = (
    <Button onClick={() => openForm(null)}>
      <Plus />
      Thêm phòng ban
    </Button>
  );

  return (
    <div className="overflow-hidden rounded-md bg-card shadow-md">
      <div className="flex items-center justify-between gap-4 p-6">
        <div className="flex items-center gap-4">
          {companies ? (
            <div className="w-80">
              <DataTableFilter
                param="company"
                label="Công ty"
                options={companies}
                includeAll={false}
                defaultValue={companyId}
              />
            </div>
          ) : (
            <p className="text-[15px] font-medium text-foreground">{companyLabel}</p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <DataTableSearch placeholder="Tìm theo tên, mã..." />
          <Button
            variant="secondary"
            disabled={searching || parentIds.size === 0}
            title={searching ? "Đang tìm kiếm: các nhánh luôn được mở" : undefined}
            onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(parentIds))}
          >
            {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
            {allCollapsed ? "Mở tất cả" : "Thu tất cả"}
          </Button>
          {addButton}
        </div>
      </div>

      <div className="relative w-full overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-y border-border">
              {["Tên phòng ban", "Mã", "Trưởng phòng", "Số nhân viên", "Trạng thái", "Thao tác"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={cn(
                    "h-14 px-4 text-left align-middle text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase first:pl-6 last:pr-6",
                    i === 3 && "w-36 text-right",
                    i === 5 && "w-28 text-right",
                  )}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <DataTableEmpty
                    title="Chưa có phòng ban nào"
                    description="Thêm phòng ban cấp cao nhất, sau đó thêm các nhóm, tổ bên trong."
                    action={addButton}
                    filtered={searching}
                    clearHref={companies ? `${PATHNAME}?company=${companyId}` : PATHNAME}
                  />
                </td>
              </tr>
            ) : (
              items.map(({ row, depth, hasChildren }) => {
                const isOpen = searching || expanded.has(row.id);
                const dimmed = searching && !matched.has(row.id);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-muted/50"
                  >
                    <td className="h-[50px] py-2 pr-4 pl-6 align-middle">
                      <div className="flex items-center gap-1" style={{ paddingLeft: depth * 24 }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggleBranch(row.id)}
                            disabled={searching}
                            className="flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted disabled:pointer-events-none"
                            aria-label={isOpen ? `Thu gọn ${row.name}` : `Mở ${row.name}`}
                            aria-expanded={isOpen}
                          >
                            {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                          </button>
                        ) : (
                          <span className="size-6 shrink-0" aria-hidden />
                        )}
                        <span
                          className={cn(
                            "text-[15px]",
                            dimmed ? "text-muted-foreground" : "font-medium text-foreground",
                            !row.isActive && "line-through decoration-foreground/30",
                          )}
                        >
                          {row.name}
                        </span>
                      </div>
                    </td>
                    <td className="h-[50px] px-4 align-middle text-[15px] whitespace-nowrap text-muted-foreground">
                      {row.code}
                    </td>
                    <td className="h-[50px] px-4 align-middle">
                      {row.managerName ? (
                        <div className="leading-tight">
                          <p className="text-[15px] text-foreground">{row.managerName}</p>
                          <p className="text-[13px] text-muted-foreground">{row.managerCode}</p>
                        </div>
                      ) : (
                        <span className="text-foreground/45">—</span>
                      )}
                    </td>
                    <td className="h-[50px] px-4 text-right align-middle text-[15px] text-muted-foreground">
                      {formatNumber(row.activeUsers)}
                    </td>
                    <td className="h-[50px] px-4 align-middle">
                      <ActiveBadge active={row.isActive} />
                    </td>
                    <td className="h-[50px] py-2 pr-6 pl-4 align-middle">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openForm(row)}
                          aria-label={`Sửa ${row.code}`}
                          title="Sửa"
                        >
                          <Pencil className="size-[18px]" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => requestToggle(row)}
                          aria-label={row.isActive ? `Ẩn ${row.code}` : `Hiện ${row.code}`}
                          title={row.isActive ? "Ẩn" : "Hiện lại"}
                        >
                          {row.isActive ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="border-t border-border px-6 py-4 text-[13px] text-muted-foreground">
        {searching
          ? `Tìm thấy ${formatNumber(matched.size)} phòng ban phù hợp`
          : `Tổng cộng ${formatNumber(allRows.length)} phòng ban`}
      </div>

      <DepartmentFormDialog
        key={formKey}
        open={formOpen}
        onOpenChange={setFormOpen}
        companyId={companyId}
        department={formTarget}
        allRows={allRows}
        employees={employees}
      />

      {toggleTarget && (
        <ConfirmDialog
          open={toggleOpen}
          onOpenChange={setToggleOpen}
          title={toggleTarget.isActive ? `Ẩn phòng ban ${toggleTarget.code}?` : `Hiện lại phòng ban ${toggleTarget.code}?`}
          description={
            toggleTarget.isActive
              ? `“${toggleTarget.name}” sẽ không chọn được khi xếp nhân viên hoặc làm phòng cha. Có thể hiện lại bất cứ lúc nào.`
              : `“${toggleTarget.name}” sẽ dùng lại được.`
          }
          confirmLabel={toggleTarget.isActive ? "Ẩn" : "Hiện lại"}
          tone={toggleTarget.isActive ? "destructive" : "default"}
          action={toggleDepartmentAction.bind(null, toggleTarget.id)}
        />
      )}
    </div>
  );
}
