"use client";

import { useState, useTransition, type ReactElement, type ReactNode } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/lib/action-state";

/**
 * Hộp xác nhận trước thao tác quan trọng (ẩn, khoá, huỷ, phát hành...).
 * `action` là server action (đã bind tham số) trả về ActionState; kết quả hiện bằng toast.
 *
 *   <ConfirmDialog
 *     trigger={<Button variant="ghost">Ẩn</Button>}
 *     title="Ẩn chức danh?"
 *     description="..."
 *     confirmLabel="Ẩn"
 *     tone="destructive"
 *     action={togglePositionAction.bind(null, id)}
 *   />
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  tone = "default",
  action,
  open: openProp,
  onOpenChange,
}: {
  /** Nút mở hộp. Bỏ trống khi điều khiển bằng `open` / `onOpenChange` (VD: mở từ menu ⋮). */
  trigger?: ReactElement;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "default" | "destructive";
  action: () => Promise<ActionState>;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [innerOpen, setInnerOpen] = useState(false);
  const open = openProp ?? innerOpen;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setInnerOpen(next);
    onOpenChange?.(next);
  };
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      try {
        const result = await action();
        if (result.ok) {
          if (result.message) toast.success(result.message);
          setOpen(false);
        } else {
          toast.error(result.message ?? "Thao tác không thành công.");
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
      {trigger && <AlertDialogTrigger render={trigger} />}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={tone === "destructive" ? "destructive" : "default"}
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? "Đang xử lý..." : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
