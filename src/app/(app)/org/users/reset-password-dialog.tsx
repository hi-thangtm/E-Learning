"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
import { resetPasswordAction } from "./actions";
import { UserPasswordResult } from "./user-password-result";

/**
 * Đặt lại mật khẩu: bước 1 xác nhận, bước 2 hiện mật khẩu mới ĐÚNG 1 LẦN (đóng là mất).
 * Điều khiển bằng open / onOpenChange; cha nên đổi `key` mỗi lần mở để bắt đầu lại từ bước 1.
 */
export function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { id: string; employeeCode: string; fullName: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const result = await resetPasswordAction(user.id);
        if (result.ok && result.password) {
          toast.success(result.message ?? "Đã đặt lại mật khẩu.");
          setPassword(result.password);
        } else {
          toast.error(result.message ?? "Không đặt lại được mật khẩu.");
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl">
        {password ? (
          <UserPasswordResult
            created={{ employeeCode: user.employeeCode, fullName: user.fullName, password }}
            title="Đã đặt lại mật khẩu"
            description={`${user.fullName} đăng nhập bằng mật khẩu mới dưới đây, sau đó phải đổi mật khẩu.`}
            onDone={() => onOpenChange(false)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Đặt lại mật khẩu cho {user.employeeCode}?</DialogTitle>
              <DialogDescription>
                Hệ thống tạo mật khẩu mới 10 ký tự cho {user.fullName}. Mật khẩu cũ hết hiệu lực ngay, khoá tạm do sai
                mật khẩu (nếu có) được gỡ, và người này phải đổi mật khẩu ở lần đăng nhập tới.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
              <Button type="button" onClick={confirm} disabled={pending}>
                {pending ? "Đang đặt lại..." : "Đặt lại mật khẩu"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
