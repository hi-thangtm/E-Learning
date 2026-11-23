"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialActionState } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/roles";
import { buildChildrenMap, flattenTree, getDescendantIds, normalizeSearch } from "@/lib/tree";
import { createDepartmentAction, updateDepartmentAction } from "./actions";
import type { DepartmentRow, EmployeeOption } from "./types";

const ROOT = "__root__";

/**
 * Dialog thêm / sửa phòng ban (điều khiển bằng open / onOpenChange). `department = null` là thêm mới.
 * Cha nên đổi `key` mỗi lần mở để form luôn mới.
 */
export function DepartmentFormDialog({
  open,
  onOpenChange,
  companyId,
  department,
  allRows,
  employees,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  department: DepartmentRow | null;
  allRows: DepartmentRow[];
  employees: EmployeeOption[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{department ? `Sửa phòng ban ${department.code}` : "Thêm phòng ban"}</DialogTitle>
          <DialogDescription>
            Đổi cấp bằng cách chọn lại phòng cha. Để trống phòng cha nếu là phòng cấp cao nhất.
          </DialogDescription>
        </DialogHeader>
        <DepartmentForm
          companyId={companyId}
          department={department}
          allRows={allRows}
          employees={employees}
          onOpenChange={onOpenChange}
        />
      </DialogContent>
    </Dialog>
  );
}

function DepartmentForm({
  companyId,
  department,
  allRows,
  employees,
  onOpenChange,
}: {
  companyId: string;
  department: DepartmentRow | null;
  allRows: DepartmentRow[];
  employees: EmployeeOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(
    department ? updateDepartmentAction : createDepartmentAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onOpenChange(false);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onOpenChange]);

  // --- Phòng cha: cùng công ty, trừ chính nó và con / cháu (chống vòng lặp) ---
  const [parentId, setParentId] = useState<string>(department?.parentId ?? ROOT);

  const parentItems = useMemo(() => {
    const excluded = department
      ? new Set([department.id, ...getDescendantIds(department.id, buildChildrenMap(allRows))])
      : new Set<string>();
    const options = flattenTree(allRows, "all")
      .filter(({ row }) => !excluded.has(row.id))
      .map(({ row, depth }) => ({
        value: row.id,
        label: `${"   ".repeat(depth)}${row.name} (${row.code})${row.isActive ? "" : " — đã ẩn"}`,
        // Phòng đã ẩn không chọn được, trừ khi đang là phòng cha hiện tại
        disabled: !row.isActive && row.id !== department?.parentId,
      }));
    return [{ value: ROOT, label: "— Cấp cao nhất —", disabled: false }, ...options];
  }, [allRows, department]);

  // --- Trưởng phòng: nhân viên đang làm của cùng công ty ---
  const managerOptions = useMemo(() => {
    // Trưởng phòng hiện tại có thể không còn trong danh sách (đã nghỉ) -> vẫn hiện để giữ nguyên
    if (department?.managerId && !employees.some((e) => e.id === department.managerId)) {
      return [
        {
          id: department.managerId,
          fullName: department.managerName ?? "Không rõ",
          employeeCode: department.managerCode ?? "",
          role: "MANAGER" as const,
        },
        ...employees,
      ];
    }
    return employees;
  }, [department, employees]);

  const [manager, setManager] = useState<EmployeeOption | null>(
    () => managerOptions.find((e) => e.id === department?.managerId) ?? null,
  );

  const willPromote = manager !== null && manager.role === "LEARNER" && manager.id !== department?.managerId;
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="contents" noValidate>
      {department && <input type="hidden" name="id" value={department.id} />}
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="parentId" value={parentId === ROOT ? "" : parentId} />
      <input type="hidden" name="managerId" value={manager?.id ?? ""} />

      <DialogBody>
          <FormGrid cols={2}>
        <FormField
          label="Mã phòng ban"
          htmlFor="code"
          required
          error={err.code}
          hint="Chữ in hoa không dấu, không trùng trong công ty. VD: KD"
        >
          <Input
            id="code"
            name="code"
            defaultValue={state.values?.code ?? department?.code}
            placeholder="VD: KD"
            maxLength={20}
            autoComplete="off"
            autoFocus
            className="uppercase placeholder:normal-case"
            aria-invalid={!!err.code}
          />
        </FormField>

        <FormField label="Tên phòng ban" htmlFor="name" required error={err.name}>
          <Input
            id="name"
            name="name"
            defaultValue={state.values?.name ?? department?.name}
            placeholder="VD: Phòng Kinh doanh"
            maxLength={100}
            autoComplete="off"
            aria-invalid={!!err.name}
          />
        </FormField>

        <FormField label="Phòng cha" htmlFor="parent-select" error={err.parentId}
              span="full">
          <Select items={parentItems} value={parentId} onValueChange={(v) => setParentId(v ? String(v) : ROOT)}>
            <SelectTrigger id="parent-select" className="w-full" aria-invalid={!!err.parentId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {parentItems.map((item) => (
                <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField
          label="Trưởng phòng"
          htmlFor="manager-input"
          error={err.managerId}
          hint="Tìm theo tên hoặc mã nhân viên. Để trống nếu chưa có."
              span="full"
        >
          <Combobox
            items={managerOptions}
            value={manager}
            onValueChange={(v) => setManager(v ?? null)}
            itemToStringLabel={(e) => `${e.fullName} (${e.employeeCode})`}
            isItemEqualToValue={(a, b) => a.id === b.id}
            filter={(e, query) => {
              const needle = normalizeSearch(query);
              return (
                normalizeSearch(e.fullName).includes(needle) || normalizeSearch(e.employeeCode).includes(needle)
              );
            }}
          >
            <ComboboxInput
              id="manager-input"
              placeholder="Chọn trưởng phòng..."
              showClear
              className="w-full"
              aria-invalid={!!err.managerId}
            />
            <ComboboxContent>
              <ComboboxEmpty>Không tìm thấy nhân viên phù hợp.</ComboboxEmpty>
              <ComboboxList>
                {(e: EmployeeOption) => (
                  <ComboboxItem key={e.id} value={e}>
                    <div className="min-w-0">
                      <p className="truncate">{e.fullName}</p>
                      <p className="truncate text-[13px] text-muted-foreground">
                        {e.employeeCode} · {ROLE_LABELS[e.role]}
                      </p>
                    </div>
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
        </FormField>

        {willPromote && (
          <div
            role="status"
            className="col-span-full flex items-start gap-2 rounded-md bg-warning/16 px-4 py-3 text-[13px] text-warning"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            <span>
              <strong className="font-medium">{manager.fullName}</strong> đang là {ROLE_LABELS.LEARNER} — sẽ được
              nâng lên {ROLE_LABELS.MANAGER} khi lưu.
            </span>
          </div>
        )}
        </FormGrid>
        </DialogBody>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : department ? "Lưu thay đổi" : "Thêm phòng ban"}
        </Button>
      </DialogFooter>
    </form>
  );
}
