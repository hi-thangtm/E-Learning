"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleCheck, CircleX, Loader2, Rocket, RotateCw, TriangleAlert } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { PublishCheckResult } from "@/lib/course-publish";
import { getPublishChecksAction, publishCourseAction } from "./actions";
import { useInfoDirty } from "./info-dirty-store";
import { formatNumber } from "@/lib/format";

/**
 * Nút “Phát hành” + hộp “Kiểm tra trước khi phát hành” (phát hành lần đầu, v0 → v1).
 * Nút chỉ tắt khi không có quyền / khoá không ở Nháp v0 — luôn kèm chú thích lý do (`disabledReason`).
 */
export function PublishButton({
  course,
  disabledReason,
}: {
  course: { id: string; code: string; title: string };
  disabledReason: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [checks, setChecks] = useState<PublishCheckResult | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [publishing, startPublishing] = useTransition();
  const infoDirty = useInfoDirty();
  const router = useRouter();

  function load() {
    setLoadError(null);
    startLoading(async () => {
      try {
        const r = await getPublishChecksAction(course.id);
        if (r.ok) setChecks(r.result);
        else setLoadError(r.message);
      } catch {
        setLoadError("Không tải được kết quả kiểm tra, vui lòng thử lại.");
      }
    });
  }

  function openDialog() {
    setChecks(null);
    setNote("");
    setNoteError(null);
    setOpen(true);
    load();
  }

  function publish() {
    startPublishing(async () => {
      try {
        const r = await publishCourseAction(course.id, note);
        if (r.ok) {
          toast.success(r.message ?? "Đã phát hành khoá học.");
          setOpen(false);
          router.refresh();
        } else {
          setNoteError(r.errors?.note ?? null);
          if (r.message) toast.error(r.message);
          load(); // có thể dữ liệu vừa đổi -> kiểm tra lại
        }
      } catch {
        toast.error("Không phát hành được, vui lòng thử lại.");
      }
    });
  }

  if (disabledReason) {
    // Nút bị khoá không nhận rê chuột -> đặt chú thích ở thẻ bọc ngoài
    return (
      <span title={disabledReason} className="inline-flex cursor-not-allowed">
        <Button disabled aria-describedby="publish-disabled-reason">
          <Rocket />
          Phát hành
        </Button>
        <span id="publish-disabled-reason" className="sr-only">
          {disabledReason}
        </span>
      </span>
    );
  }

  const failed = checks?.checks.filter((c) => !c.ok).length ?? 0;
  const ready = !!checks && checks.passed;

  return (
    <>
      <Button onClick={openDialog}>
        <Rocket />
        Phát hành
      </Button>

      <Dialog open={open} onOpenChange={(o) => !publishing && setOpen(o)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Kiểm tra trước khi phát hành</DialogTitle>
            <DialogDescription>
              {course.code} — {course.title}. Phát hành lần đầu tạo phiên bản 1; sau đó khoá mới giao được cho học viên.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="grid gap-4">
            {infoDirty && (
              <p role="status" className="flex items-start gap-2 rounded-md bg-warning/16 px-4 py-3 text-[15px] text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Tab Thông tin đang có thay đổi chưa lưu. Bấm “Lưu thay đổi” ở tab đó trước khi phát hành, nếu không các thay đổi đó sẽ không có trong bản phát hành.
              </p>
            )}

            {loadError ? (
              <div className="flex items-center justify-between gap-4 rounded-md bg-destructive/16 px-4 py-3 text-[15px] text-destructive">
                <span>{loadError}</span>
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                  <RotateCw />
                  Thử lại
                </Button>
              </div>
            ) : !checks ? (
              <p className="flex items-center gap-2 py-6 text-[15px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang kiểm tra nội dung khoá học…
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <p className={failed > 0 ? "text-[15px] text-destructive" : "text-[15px] text-success"}>
                    {failed > 0 ? `Còn ${failed} điều kiện chưa đạt.` : "Tất cả điều kiện đã đạt."}
                  </p>
                  <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 className="animate-spin" /> : <RotateCw />}
                    Kiểm tra lại
                  </Button>
                </div>
                <ul className="grid gap-2" aria-label="Điều kiện phát hành">
                  {checks.checks.map((c, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-md border border-border px-4 py-2.5 text-[15px]"
                    >
                      {c.ok ? (
                        <CircleCheck className="mt-0.5 size-5 shrink-0 text-success" aria-label="Đạt" />
                      ) : (
                        <CircleX className="mt-0.5 size-5 shrink-0 text-destructive" aria-label="Chưa đạt" />
                      )}
                      <span className={c.ok ? "flex-1 text-foreground" : "flex-1 text-destructive"}>{c.label}</span>
                      {!c.ok && c.fix && (
                        <Link
                          href={c.fix.href}
                          onClick={() => setOpen(false)}
                          className="shrink-0 text-[13px] font-medium text-primary hover:underline"
                        >
                          {c.fix.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>

                {ready && (
                  <FormGrid>
                    <div className="rounded-md bg-muted/60 px-4 py-3 text-[15px] text-foreground">
                      <p className="font-medium">Phiên bản 1 — phát hành lần đầu</p>
                      <p className="mt-1 text-[13px] text-muted-foreground">
                        {formatNumber(checks.summary.sections)} chương · {formatNumber(checks.summary.lessons)} bài (
                        {formatNumber(checks.summary.videos)} video, {formatNumber(checks.summary.documents)} tài liệu,{" "}
                        {formatNumber(checks.summary.quizzes)} bài kiểm tra) · ngân hàng {formatNumber(checks.summary.questions)} câu hỏi đang
                        dùng.
                      </p>
                    </div>
                    <FormField
                      label="Ghi chú phát hành"
                      htmlFor="publish-note"
                      error={noteError ?? undefined}
                      hint="Tuỳ chọn — lưu cùng phiên bản 1 (tối đa 2.000 ký tự)."
                    >
                      <Textarea
                        id="publish-note"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        maxLength={2000}
                        rows={3}
                        aria-invalid={!!noteError}
                      />
                    </FormField>
                  </FormGrid>
                )}
              </>
            )}
          </DialogBody>

          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={publishing} />}>Đóng</DialogClose>
            <Button onClick={publish} disabled={!ready || loading || publishing}>
              {publishing ? <Loader2 className="animate-spin" /> : <Rocket />}
              {publishing ? "Đang phát hành..." : "Xác nhận phát hành"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
