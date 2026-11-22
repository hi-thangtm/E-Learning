"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Ban, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
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
import { Textarea } from "@/components/ui/textarea";
import { revokeCertificateAction } from "./certificate-actions";

/** Nút "Thu hồi" + hộp xác nhận bắt nhập lý do. */
export function RevokeCertificateDialog({ certificate }: { certificate: { id: string; code: string; courseTitle: string } }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const r = await revokeCertificateAction(certificate.id, reason);
        if (r.ok) {
          toast.success(r.message ?? "Đã thu hồi.");
          setOpen(false);
          router.refresh();
        } else {
          setError(r.errors?.reason ?? null);
          if (r.message) toast.error(r.message);
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        if (o) {
          setReason("");
          setError(null);
        }
        setOpen(o);
      }}
    >
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="text-destructive">
            <Ban />
            Thu hồi
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Thu hồi chứng nhận {certificate.code}?</DialogTitle>
          <DialogDescription>
            Khoá “{certificate.courseTitle}”. Sau khi thu hồi, trang tra cứu hiện “Đã thu hồi” và PDF có chữ chìm “ĐÃ THU HỒI”. Không hoàn tác được.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody>
            <FormGrid>
              <FormField label="Lý do thu hồi" htmlFor={`revoke-${certificate.id}`} required error={error ?? undefined} hint="5–500 ký tự, ghi vào nhật ký.">
                <Textarea
                  id={`revoke-${certificate.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  rows={3}
                  autoFocus
                  aria-invalid={!!error}
                />
              </FormField>
            </FormGrid>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || reason.trim().length < 5}>
              {pending ? <Loader2 className="animate-spin" /> : <Ban />}
              Thu hồi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
