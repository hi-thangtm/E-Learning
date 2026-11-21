"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * Màn kết quả sau khi tạo người dùng: hiện mật khẩu ban đầu ĐÚNG 1 LẦN.
 * Mật khẩu chỉ nằm trong bộ nhớ của dialog — đóng dialog là mất, không lưu ở đâu khác.
 */
export function UserPasswordResult({
  created,
  onDone,
  title = "Đã tạo tài khoản",
  description,
}: {
  created: { employeeCode: string; fullName: string; password: string };
  onDone: () => void;
  /** Mặc định cho trường hợp tạo mới; đặt lại mật khẩu truyền tiêu đề riêng */
  title?: string;
  description?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
      toast.success("Đã sao chép mật khẩu.");
    } catch {
      toast.error("Không sao chép được, hãy chọn và sao chép thủ công.");
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>
          {description ??
            `${created.fullName} đăng nhập bằng mã nhân viên và mật khẩu dưới đây, sau đó phải đổi mật khẩu.`}
        </DialogDescription>
      </DialogHeader>

      <DialogBody className="grid gap-4">
        <div className="grid grid-cols-[140px_1fr] items-center gap-y-3 rounded-md border border-border p-4 text-[15px]">
          <span className="text-muted-foreground">Mã nhân viên</span>
          <span className="font-medium text-foreground">{created.employeeCode}</span>

          <span className="text-muted-foreground">Mật khẩu</span>
          <div className="flex items-center gap-3">
            <KeyRound className="size-4 shrink-0 text-primary" />
            <code className="rounded-sm bg-muted px-2 py-1 font-mono text-[17px] tracking-wider text-foreground select-all">
              {created.password}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Đã sao chép" : "Sao chép"}
            </Button>
          </div>
        </div>

        <p
          role="note"
          className="flex items-center gap-2 rounded-md bg-warning/16 px-4 py-2.5 text-[13px] text-warning"
        >
          <TriangleAlert className="size-4 shrink-0" />
          Mật khẩu chỉ hiện 1 lần. Hãy sao chép và gửi cho nhân viên trước khi đóng.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button type="button" onClick={onDone}>
          Xong
        </Button>
      </DialogFooter>
    </>
  );
}
