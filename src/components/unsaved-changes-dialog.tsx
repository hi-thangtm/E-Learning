"use client";

import { useEffect } from "react";
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

/**
 * Hộp “Bỏ thay đổi chưa lưu?” (Việc 33 F9) — dùng khi rời form có thay đổi chưa lưu (chuyển tab, Esc, bấm ra ngoài dialog…).
 * “Ở lại” (mặc định, focus đầu tiên) giữ nguyên; “Bỏ thay đổi” gọi `onDiscard`.
 */
export function UnsavedChangesDialog({
  open,
  onStay,
  onDiscard,
  description = "Bạn có thay đổi chưa lưu. Rời đi bây giờ thì các thay đổi này sẽ mất.",
}: {
  open: boolean;
  onStay: () => void;
  onDiscard: () => void;
  description?: string;
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bỏ thay đổi chưa lưu?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Ở lại</AlertDialogCancel>
          <Button variant="destructive" onClick={onDiscard}>
            Bỏ thay đổi
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Có thay đổi chưa lưu → trình duyệt hỏi trước khi tải lại / đóng tab / gõ địa chỉ khác (hộp mặc định của trình duyệt). */
export function useBeforeUnloadWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Một số trình duyệt cũ cần returnValue
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
}
