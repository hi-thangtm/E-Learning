"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePasswordAction, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = {};

/** Đổi mật khẩu: lỗi gắn theo từng ô + nút ẩn / hiện mật khẩu như trang đăng nhập (ui-review #24). */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePasswordAction, initialState);
  const err = state.fieldErrors ?? {};

  return (
    <form action={formAction} className="grid gap-4" noValidate>
      {state.error && (
        <p role="alert" className="rounded-md bg-destructive/16 px-4 py-3 text-[13px] text-destructive">
          {state.error}
        </p>
      )}
      <FormField label="Mật khẩu hiện tại" htmlFor="currentPassword" required error={err.currentPassword}>
        <PasswordInput id="currentPassword" autoComplete="current-password" error={!!err.currentPassword} />
      </FormField>
      <FormField label="Mật khẩu mới" htmlFor="newPassword" required hint="Tối thiểu 8 ký tự, có cả chữ và số." error={err.newPassword}>
        <PasswordInput id="newPassword" autoComplete="new-password" error={!!err.newPassword} />
      </FormField>
      <FormField label="Nhập lại mật khẩu mới" htmlFor="confirmPassword" required error={err.confirmPassword}>
        <PasswordInput id="confirmPassword" autoComplete="new-password" error={!!err.confirmPassword} />
      </FormField>

      <Button type="submit" className="mt-2 w-full" disabled={pending}>
        {pending ? "Đang lưu..." : "Đổi mật khẩu"}
      </Button>
    </form>
  );
}

function PasswordInput({ id, autoComplete, error }: { id: string; autoComplete: string; error: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        name={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        required
        className="pr-11"
        aria-invalid={error || undefined}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
        aria-pressed={show}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:text-primary"
      >
        {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
      </button>
    </div>
  );
}
