"use client";

import { useEffect, useState, useTransition, type ReactElement } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedControl } from "@/components/segmented-control";
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
import { formatNumber } from "@/lib/format";
import { previewReminderAction, sendReminderAction } from "./actions";
import type { MemberSelection, ReminderMode, ReminderPreview } from "./types";

const NOTE_MAX = 200;

/** Hộp “Nhắc nhở”: chọn kiểu nhắc + lời nhắn → xem số thông báo sẽ gửi → Gửi. */
export function RemindDialog({
  trigger,
  selection,
  targetLabel,
  onSent,
}: {
  trigger: ReactElement;
  selection: MemberSelection;
  /** VD “3 người đã chọn”, “Nguyễn Văn A” */
  targetLabel: string;
  onSent?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ReminderMode>("overdue");
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  // Xem trước số thông báo mỗi khi mở hộp / đổi kiểu nhắc
  useEffect(() => {
    if (!open) return;
    startLoading(async () => {
      try {
        setPreview(await previewReminderAction(selection, mode));
      } catch {
        setPreview({ ok: false, message: "Không tính được số thông báo, vui lòng thử lại." });
      }
    });
  }, [open, mode, selection]);

  function send() {
    startSending(async () => {
      try {
        const r = await sendReminderAction(selection, mode, note);
        if (!r.ok) return void toast.error(r.message);
        toast.success(r.message);
        setOpen(false);
        onSent?.();
      } catch {
        toast.error("Gửi nhắc nhở không thành công, vui lòng thử lại.");
      }
    });
  }

  const count = preview?.ok ? preview.notifications : 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (sending) return;
        if (next) {
          setMode("overdue");
          setNote("");
          setPreview(null);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nhắc nhở nhân viên</DialogTitle>
          <DialogDescription>Gửi thông báo nhắc hoàn thành khoá học tới {targetLabel}.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4">
            <FormField label="Nhắc về" htmlFor="remind-mode">
              <SegmentedControl
                id="remind-mode"
                ariaLabel="Kiểu nhắc"
                options={[
                  { value: "overdue", label: "Các khoá đang quá hạn" },
                  { value: "all", label: "Tất cả khoá chưa hoàn thành" },
                ]}
                value={mode}
                onChange={setMode}
                disabled={sending}
              />
            </FormField>
            <FormField label="Lời nhắn thêm (không bắt buộc)" htmlFor="remind-note">
              <Textarea
                id="remind-note"
                value={note}
                onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
                maxLength={NOTE_MAX}
                rows={2}
                disabled={sending}
                placeholder="VD: Hoàn thành trước buổi họp thứ Hai nhé."
              />
              <span className="mt-1 block text-right text-[12px] text-muted-foreground tabular-nums">
                {note.length}/{NOTE_MAX}
              </span>
            </FormField>
            <p aria-live="polite" className="rounded-md bg-muted px-4 py-3 text-[15px]">
              {!preview || loading ? (
                <span className="text-muted-foreground">Đang tính số thông báo...</span>
              ) : !preview.ok ? (
                <span className="text-destructive">{preview.message}</span>
              ) : preview.notifications === 0 ? (
                <span className="text-muted-foreground">
                  {mode === "overdue" ? "Không có khoá nào đang quá hạn để nhắc." : "Không còn khoá nào chưa hoàn thành để nhắc."}
                </span>
              ) : (
                <span className="text-foreground">
                  Sẽ gửi <b className="font-medium">{formatNumber(preview.notifications)}</b> thông báo tới{" "}
                  <b className="font-medium">{formatNumber(preview.people)}</b> người (mỗi khoá 1 thông báo; khoá đã nhắc hôm nay sẽ bỏ qua).
                </span>
              )}
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={sending} />}>Huỷ</DialogClose>
          <Button type="button" disabled={sending || loading || count === 0} onClick={send}>
            {sending ? "Đang gửi..." : `Gửi nhắc nhở${count ? ` (${formatNumber(count)})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
