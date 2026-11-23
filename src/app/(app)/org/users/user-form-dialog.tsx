"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { Role } from "@prisma/client";
import { Eye, EyeOff, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { SegmentedControl } from "@/components/segmented-control";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialActionState } from "@/lib/action-state";
import { ROLE_LABELS } from "@/lib/roles";
import { flattenTree } from "@/lib/tree";
import { createUserAction, updateUserAction } from "./actions";
import type { CreateUserState, UserFormValue } from "./types";
import { useUserFormOptions } from "./user-form-options";
import { UserPasswordResult } from "./user-password-result";

const NONE = "__none__";

type Created = NonNullable<CreateUserState["created"]>;

/**
 * Dialog thêm / sửa người dùng. Không truyền `user` = thêm mới.
 * Hai cách mở: có `trigger` (nút mở), hoặc điều khiển bằng `open` / `onOpenChange` (VD: mở từ menu ⋮ —
 * khi đó cha nên đổi `key` mỗi lần mở để form luôn mới).
 */
export function UserFormDialog({
  trigger,
  user,
  open: openProp,
  onOpenChange,
}: {
  trigger?: ReactElement;
  user?: UserFormValue;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  // Mỗi lần mở dialog tạo form mới -> xoá lỗi / dữ liệu / mật khẩu cũ
  const [formKey, setFormKey] = useState(0);
  const [created, setCreated] = useState<Created | null>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      if (openProp === undefined) setInnerOpen(next);
      onOpenChange?.(next);
    },
    [openProp, onOpenChange],
  );
  const close = useCallback(() => setOpen(false), [setOpen]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setFormKey((k) => k + 1);
          setCreated(null);
        }
        setOpen(next);
      }}
    >
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className="sm:max-w-2xl">
        {created ? (
          <UserPasswordResult created={created} onDone={close} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{user ? `Sửa người dùng ${user.employeeCode}` : "Thêm người dùng"}</DialogTitle>
              <DialogDescription>
                {user
                  ? "Cập nhật thông tin, phòng ban, chức danh và vai trò."
                  : "Người dùng mới phải đổi mật khẩu ở lần đăng nhập đầu."}
              </DialogDescription>
            </DialogHeader>
            <UserForm key={formKey} user={user} onSuccess={close} onCreated={setCreated} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function UserForm({
  user,
  onSuccess,
  onCreated,
}: {
  user?: UserFormValue;
  onSuccess: () => void;
  onCreated: (created: Created) => void;
}) {
  const options = useUserFormOptions();
  const action: (prev: CreateUserState, formData: FormData) => Promise<CreateUserState> = user
    ? updateUserAction
    : createUserAction;
  const [state, formAction, pending] = useActionState(action, initialActionState as CreateUserState);

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      if (state.created) onCreated(state.created);
      else onSuccess();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess, onCreated]);

  const isSelf = user?.id === options.actorId;
  const err = state.errors ?? {};

  // --- Các ô điều khiển (giữ nguyên giá trị khi server trả lỗi) ---
  const [employeeCode, setEmployeeCode] = useState(user?.employeeCode ?? "");
  const [companyId, setCompanyId] = useState(user?.companyId ?? options.defaultCompanyId);
  const [departmentId, setDepartmentId] = useState(user?.departmentId || NONE);
  const [positionId, setPositionId] = useState(user?.positionId || NONE);
  const [role, setRole] = useState<Role>(user?.role ?? "LEARNER");
  const [passwordMode, setPasswordMode] = useState<"auto" | "manual">("auto");
  const [showPassword, setShowPassword] = useState(false);

  const company = options.companies.find((c) => c.id === companyId);
  const companyChanged = !!user && companyId !== user.companyId;

  const companyItems = useMemo(
    () =>
      options.companies.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}${c.isGroup ? " (công ty tổng)" : ""}${c.isActive ? "" : " — tạm ngưng"}`,
        disabled: !c.isActive && c.id !== user?.companyId,
      })),
    [options.companies, user],
  );

  // Phòng ban của công ty đang chọn (dạng cây); phòng đã ẩn chỉ hiện nếu đang là phòng hiện tại
  const departmentItems = useMemo(() => {
    const rows = options.departments.filter(
      (d) => d.companyId === companyId && (d.isActive || d.id === user?.departmentId),
    );
    return [
      { value: NONE, label: "— Không thuộc phòng ban —" },
      ...flattenTree(rows, "all").map(({ row, depth }) => ({
        value: row.id,
        label: `${"   ".repeat(depth)}${row.name} (${row.code})${row.isActive ? "" : " — đã ẩn"}`,
      })),
    ];
  }, [options.departments, companyId, user]);

  const positionItems = useMemo(
    () => [
      { value: NONE, label: "— Chưa có chức danh —" },
      ...options.positions
        .filter((p) => p.isActive || p.id === user?.positionId)
        .map((p) => ({ value: p.id, label: `${p.name}${p.isActive ? "" : " — đã ẩn"}` })),
    ],
    [options.positions, user],
  );

  const roleItems = useMemo(
    () =>
      options.assignableRoles.map((r) => ({
        value: r,
        label: ROLE_LABELS[r],
        // Admin tập đoàn chỉ gán cho người thuộc công ty tổng
        disabled: r === "GROUP_ADMIN" && companyId !== options.groupCompanyId,
      })),
    [options.assignableRoles, options.groupCompanyId, companyId],
  );

  const codeChanged = !!user && employeeCode.trim().toUpperCase() !== user.employeeCode;

  // --- Xác nhận chuyển công ty: chặn submit, mở hộp cảnh báo, xác nhận xong mới gửi ---
  const formRef = useRef<HTMLFormElement>(null);
  const confirmRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (companyChanged && confirmRef.current?.value !== "1") {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  function confirmTransfer() {
    if (confirmRef.current) confirmRef.current.value = "1";
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  const oldCompany = options.companies.find((c) => c.id === user?.companyId);

  return (
    <>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} className="contents" noValidate>
        {user && <input type="hidden" name="id" value={user.id} />}
        <input type="hidden" name="companyId" value={companyId} />
        <input type="hidden" name="departmentId" value={departmentId === NONE ? "" : departmentId} />
        <input type="hidden" name="positionId" value={positionId === NONE ? "" : positionId} />
        <input type="hidden" name="role" value={role} />
        {/* Reset về "" sau mỗi lần gửi (React reset form) -> lần sau phải xác nhận lại */}
        <input ref={confirmRef} type="hidden" name="confirmTransfer" defaultValue="" />
        {!user && <input type="hidden" name="passwordMode" value={passwordMode} />}

        <DialogBody>
          <FormGrid cols={2}>
          <FormField
            label="Mã nhân viên"
            htmlFor="employeeCode"
            required
            error={err.employeeCode}
            hint="Là tên đăng nhập, không trùng trong toàn tập đoàn."
          >
            <Input
              id="employeeCode"
              name="employeeCode"
              value={employeeCode}
              onChange={(e) => setEmployeeCode(e.target.value)}
              placeholder="VD: NV00123"
              maxLength={30}
              autoComplete="off"
              autoFocus
              className="uppercase placeholder:normal-case"
              aria-invalid={!!err.employeeCode}
            />
          </FormField>

          <FormField label="Họ tên" htmlFor="fullName" required error={err.fullName}>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={state.values?.fullName ?? user?.fullName}
              placeholder="VD: Nguyễn Văn An"
              maxLength={100}
              autoComplete="off"
              aria-invalid={!!err.fullName}
            />
          </FormField>

          {codeChanged && (
            <p
              role="status"
              className="col-span-full flex items-center gap-2 rounded-md bg-warning/16 px-4 py-2.5 text-[13px] text-warning"
            >
              <TriangleAlert className="size-4 shrink-0" />
              Nhân viên sẽ đăng nhập bằng mã mới “{employeeCode.trim().toUpperCase()}”.
            </p>
          )}

          <FormField label="Email" htmlFor="email" error={err.email}>
            <Input
              id="email"
              name="email"
              type="email"
              defaultValue={state.values?.email ?? user?.email}
              placeholder="VD: an.nguyen@congty.vn"
              maxLength={150}
              autoComplete="off"
              aria-invalid={!!err.email}
            />
          </FormField>

          <FormField label="Điện thoại" htmlFor="phone" error={err.phone}>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={state.values?.phone ?? user?.phone}
              placeholder="VD: 0901 234 567"
              maxLength={20}
              autoComplete="off"
              aria-invalid={!!err.phone}
            />
          </FormField>

          <FormField
            label="Công ty"
            htmlFor="company-select"
            required
            error={err.companyId}
            hint={
              !options.isGroupAdmin
                ? "Bạn chỉ quản lý nhân viên của công ty mình."
                : isSelf
                  ? "Bạn không thể tự chuyển công ty của chính mình."
                  : undefined
            }
          >
            {options.isGroupAdmin ? (
              <Select
                items={companyItems}
                value={companyId}
                disabled={isSelf}
                onValueChange={(v) => {
                  const next = v ? String(v) : companyId;
                  if (next !== companyId) {
                    setCompanyId(next);
                    // Phòng ban thuộc từng công ty -> chọn lại
                    setDepartmentId(NONE);
                  }
                }}
              >
                <SelectTrigger id="company-select" className="w-full" aria-invalid={!!err.companyId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {companyItems.map((item) => (
                    <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="company-select"
                value={company ? `${company.code} — ${company.name}` : ""}
                readOnly
                className="bg-muted text-muted-foreground"
              />
            )}
          </FormField>

          <FormField label="Ngày vào làm" htmlFor="hireDate" error={err.hireDate}>
            <Input
              id="hireDate"
              name="hireDate"
              type="date"
              defaultValue={state.values?.hireDate ?? user?.hireDate}
              aria-invalid={!!err.hireDate}
            />
          </FormField>

          <FormField label="Phòng ban" htmlFor="department-select" error={err.departmentId}>
            <Select items={departmentItems} value={departmentId} onValueChange={(v) => setDepartmentId(v ? String(v) : NONE)}>
              <SelectTrigger id="department-select" className="w-full" aria-invalid={!!err.departmentId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departmentItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField label="Chức danh" htmlFor="position-select" error={err.positionId}>
            <Select items={positionItems} value={positionId} onValueChange={(v) => setPositionId(v ? String(v) : NONE)}>
              <SelectTrigger id="position-select" className="w-full" aria-invalid={!!err.positionId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positionItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <FormField
            label="Vai trò"
            htmlFor="role-select"
            required
            error={err.role}
            hint={isSelf ? "Bạn không thể tự đổi vai trò của chính mình." : undefined}
          >
            <Select items={roleItems} value={role} disabled={isSelf} onValueChange={(v) => v && setRole(v as Role)}>
              <SelectTrigger id="role-select" className="w-full" aria-invalid={!!err.role}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roleItems.map((item) => (
                  <SelectItem key={item.value} value={item.value} disabled={item.disabled}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          {!user && (
            <FormField
              label="Mật khẩu ban đầu"
              htmlFor="password"
              error={err.password}
              span="full"
              hint={
                passwordMode === "auto"
                  ? "Hệ thống tự sinh 10 ký tự (chữ + số) và hiện 1 lần sau khi lưu."
                  : "Tối thiểu 8 ký tự, có cả chữ và số."
              }
            >
              <div className="flex items-center gap-4">
                <SegmentedControl
                  ariaLabel="Cách tạo mật khẩu"
                  value={passwordMode}
                  onChange={setPasswordMode}
                  options={[
                    { value: "auto", label: "Tự sinh" },
                    { value: "manual", label: "Tự nhập" },
                  ]}
                />
                {passwordMode === "manual" && (
                  <div className="relative flex-1">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      maxLength={100}
                      autoComplete="new-password"
                      className="pr-10"
                      aria-invalid={!!err.password}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                )}
              </div>
            </FormField>
          )}
          </FormGrid>
        </DialogBody>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : companyChanged ? "Chuyển công ty và lưu" : user ? "Lưu thay đổi" : "Thêm người dùng"}
          </Button>
        </DialogFooter>
      </form>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Chuyển {user?.employeeCode} sang {company?.code}?</AlertDialogTitle>
            <AlertDialogDescription render={<div />}>
              <p>
                Nhân viên sẽ rời {oldCompany ? `${oldCompany.code} — ${oldCompany.name}` : "công ty cũ"} và bị xoá
                khỏi phòng ban cũ.
              </p>
              {user && user.managedDepartments.length > 0 ? (
                <div className="mt-3">
                  <p className="font-medium text-foreground">Sẽ bị gỡ khỏi vị trí trưởng phòng của:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {user.managedDepartments.map((d) => (
                      <li key={d.code}>
                        {d.name} ({d.code})
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="mt-2">Người này không làm trưởng phòng nào ở công ty cũ.</p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <Button variant="destructive" onClick={confirmTransfer}>
              Chuyển công ty
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
