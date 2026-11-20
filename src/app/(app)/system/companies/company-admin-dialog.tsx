"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { createCompanyAdminAction } from "./actions";

/**
 * Dialog "Tạo tài khoản admin" cho 1 công ty con — mở từ menu ⋮ (điều khiển bằng open / onOpenChange).
 * Popup tự huỷ khi đóng nên mỗi lần mở là một form mới. `onOpenChange` nên là setState của cha.
 */
export function CompanyAdminDialog({
  company,
  open,
  onOpenChange,
}: {
  company: { id: string; code: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tạo tài khoản admin</DialogTitle>
          <DialogDescription>
            Admin của {company.name} ({company.code}). Người này phải đổi mật khẩu ở lần đăng nhập đầu.
          </DialogDescription>
        </DialogHeader>
        <AdminForm companyId={company.id} onOpenChange={onOpenChange} />
      </DialogContent>
    </Dialog>
  );
}

function AdminForm({
  companyId,
  onOpenChange,
}: {
  companyId: string;
  /** Nên là hàm ổn định (VD: setState của cha) để toast không chạy lặp */
  onOpenChange: (open: boolean) => void;
}) {
  const [state, formAction, pending] = useActionState(createCompanyAdminAction, initialActionState);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onOpenChange(false);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onOpenChange]);

  const err = state.errors ?? {};

  return (
    <form action={formAction} className="grid grid-cols-2 gap-4" noValidate>
      <input type="hidden" name="companyId" value={companyId} />

      <FormField
        label="Mã nhân viên"
        htmlFor="employeeCode"
        required
        error={err.employeeCode}
        hint="Là tên đăng nhập. VD: CTYB-ADMIN"
      >
        <Input
          id="employeeCode"
          name="employeeCode"
          defaultValue={state.values?.employeeCode}
          placeholder="VD: CTYB-ADMIN"
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
          defaultValue={state.values?.fullName}
          placeholder="VD: Nguyễn Văn An"
          maxLength={100}
          autoComplete="off"
          aria-invalid={!!err.fullName}
        />
      </FormField>

      <FormField label="Email" htmlFor="email" error={err.email} hint="Không bắt buộc">
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={state.values?.email}
          placeholder="VD: an.nguyen@congty.vn"
          maxLength={150}
          autoComplete="off"
          aria-invalid={!!err.email}
        />
      </FormField>

      <FormField
        label="Mật khẩu tạm"
        htmlFor="password"
        required
        error={err.password}
        hint="Tối thiểu 8 ký tự, có cả chữ và số."
      >
        <div className="relative">
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
      </FormField>

      <DialogFooter className="col-span-2 pt-2">
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang tạo..." : "Tạo tài khoản"}
        </Button>
      </DialogFooter>
    </form>
  );
}
