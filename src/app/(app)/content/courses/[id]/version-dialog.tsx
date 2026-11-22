"use client";

import { useEffect, useRef, useState, useTransition, type ReactElement } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, FileDiff, Loader2, RefreshCcw, Send, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { LessonContent } from "@/components/learning/lesson-content";
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
import { addDaysIso, formatDate, formatNumber, vnDayEnd, vnIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { DocumentEditor } from "./document-editor";
import { approveProposalAction, previewImpactAction, publishVersionAction } from "./version-actions";

type ChangeKind = "MINOR" | "MAJOR";

export type VersionDialogMode =
  | {
      kind: "new";
      /** Được phát hành MINOR */
      allowMinor: boolean;
      /** Được phát hành MAJOR trực tiếp (Admin) */
      allowMajor: boolean;
      /** Chỉ được đề xuất MAJOR (Biên soạn) */
      allowPropose: boolean;
      /** Lý do không chọn được MAJOR (VD đã có đề xuất chờ duyệt) */
      majorBlockedReason: string | null;
      defaultDueDays: number;
    }
  | { kind: "approve"; proposal: { id: string; summaryHtml: string; dueInDays: number } };

const STEPS = ["Loại cập nhật", "Nội dung", "Xác nhận"];

/**
 * Dialog phát hành bản cập nhật 3 bước: chọn loại → tóm tắt + hạn → xác nhận (số người bị ảnh hưởng, MAJOR gõ mã khoá).
 * Chế độ "approve": duyệt đề xuất MAJOR — mở thẳng bước 3, tóm tắt lấy từ đề xuất.
 */
export function VersionDialog({
  course,
  mode,
  trigger,
}: {
  course: { id: string; code: string; title: string };
  mode: VersionDialogMode;
  trigger: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl">
        <VersionWizard key={formKey} course={course} mode={mode} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function VersionWizard({
  course,
  mode,
  onDone,
}: {
  course: { id: string; code: string; title: string };
  mode: VersionDialogMode;
  onDone: () => void;
}) {
  const approving = mode.kind === "approve";
  const [step, setStep] = useState(approving ? 2 : 0);
  const [kind, setKind] = useState<ChangeKind | null>(
    approving ? "MAJOR" : mode.allowMinor ? "MINOR" : null,
  );
  const [dueInDays, setDueInDays] = useState(String(approving ? mode.proposal.dueInDays : mode.defaultDueDays));
  const [summaryHtml, setSummaryHtml] = useState(approving ? mode.proposal.summaryHtml : "");
  const [confirmCode, setConfirmCode] = useState("");
  const [impact, setImpact] = useState<{ completed: number; inProgress: number } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, startLoading] = useTransition();
  const [submitting, startSubmitting] = useTransition();
  const contentRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Biên soạn chọn MAJOR -> gửi đề xuất (không phát hành)
  const proposing = !approving && kind === "MAJOR" && !mode.allowMajor;
  const requiresCode = kind === "MAJOR" && !proposing;
  const days = Number(dueInDays);
  const daysValid = Number.isInteger(days) && days >= 1 && days <= 365;
  const dueText = daysValid ? formatDate(vnDayEnd(addDaysIso(vnIsoDate(), days))) : "—";

  function loadImpact() {
    startLoading(async () => {
      const r = await previewImpactAction(course.id);
      if (r.ok) setImpact({ completed: r.completed, inProgress: r.inProgress });
      else toast.error(r.message);
    });
  }

  // Duyệt đề xuất: mở thẳng bước 3 -> tải số người bị ảnh hưởng ngay khi mở
  useEffect(() => {
    if (!approving) return;
    let cancelled = false;
    previewImpactAction(course.id)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setImpact({ completed: r.completed, inProgress: r.inProgress });
        else toast.error(r.message);
      })
      .catch(() => !cancelled && toast.error("Không tải được số người bị ảnh hưởng."));
    return () => {
      cancelled = true;
    };
  }, [approving, course.id]);

  function next() {
    if (step === 0) {
      if (!kind) return;
      setStep(1);
      return;
    }
    if (step === 1) {
      // Đọc nội dung Tiptap từ ô ẩn của DocumentEditor
      const html = (contentRef.current?.querySelector('input[name="summary"]') as HTMLInputElement | null)?.value ?? "";
      const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
      const nextErrors: Record<string, string> = {};
      if (!text) nextErrors.summary = "Vui lòng nhập tóm tắt thay đổi.";
      if (!daysValid) nextErrors.dueInDays = "Số ngày từ 1 đến 365.";
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) return;
      setSummaryHtml(html);
      setStep(2);
      loadImpact();
    }
  }

  function submit() {
    startSubmitting(async () => {
      try {
        const r = approving
          ? await approveProposalAction({ versionId: mode.proposal.id, dueInDays, confirmCode })
          : await publishVersionAction({ courseId: course.id, changeType: kind!, summary: summaryHtml, dueInDays, confirmCode });
        if (r.ok) {
          toast.success(r.message ?? "Đã lưu.");
          onDone();
          router.refresh();
          return;
        }
        const errs = r.errors ?? {};
        setErrors(errs);
        if (errs.summary || errs.dueInDays) setStep(approving ? 2 : 1);
        if (r.message) toast.error(r.message);
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  const majorOptionAllowed = !approving && (mode.allowMajor || mode.allowPropose) && !mode.majorBlockedReason;
  const affectedVerb = kind === "MAJOR" ? "sẽ phải HỌC LẠI" : "sẽ được yêu cầu ĐỌC & XÁC NHẬN";
  const canSubmit =
    step === 2 && !!impact && daysValid && (!requiresCode || confirmCode.trim().toUpperCase() === course.code.toUpperCase());

  return (
    <>
      <DialogHeader>
        <DialogTitle>{approving ? "Duyệt & phát hành đề xuất MAJOR" : "Phát hành bản cập nhật"}</DialogTitle>
        <DialogDescription>
          {course.code} — {course.title}
        </DialogDescription>
        {!approving && (
          <ol className="mt-2 flex items-center gap-2 text-[13px]" aria-label="Các bước">
            {STEPS.map((label, i) => (
              <li key={label} className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-[12px] font-medium",
                    i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary/16 text-primary" : "bg-muted text-muted-foreground",
                  )}
                  aria-current={i === step ? "step" : undefined}
                >
                  {i + 1}
                </span>
                <span className={i === step ? "font-medium text-foreground" : "text-muted-foreground"}>{label}</span>
                {i < STEPS.length - 1 && <span aria-hidden className="h-px w-6 bg-border" />}
              </li>
            ))}
          </ol>
        )}
      </DialogHeader>

      <DialogBody>
        {/* Bước 1: chọn loại */}
        {step === 0 && !approving && (
          <div role="radiogroup" aria-label="Loại cập nhật" className="grid grid-cols-2 gap-4">
            <KindCard
              selected={kind === "MINOR"}
              disabled={!mode.allowMinor}
              disabledReason="Bạn không có quyền phát hành bản cập nhật cho khoá này."
              onSelect={() => setKind("MINOR")}
              icon={<FileDiff className="size-5" />}
              title="MINOR · Đọc & xác nhận"
              description="Thay đổi nhỏ. Người đã học xong chỉ cần đọc tóm tắt thay đổi và bấm xác nhận. Tiến độ, điểm, chứng nhận giữ nguyên."
            />
            <KindCard
              selected={kind === "MAJOR"}
              disabled={!majorOptionAllowed}
              disabledReason={mode.majorBlockedReason ?? "Chỉ Admin hoặc Biên soạn của công ty sở hữu khoá."}
              onSelect={() => setKind("MAJOR")}
              icon={<RefreshCcw className="size-5" />}
              title="MAJOR · Học lại toàn bộ"
              description={
                mode.allowMajor
                  ? "Thay đổi lớn. Mọi người ĐÃ HỌC XONG sẽ bị đặt lại về 0% và phải học lại + làm lại bài kiểm tra trước hạn mới. Người đang học giữ nguyên tiến độ."
                  : "Thay đổi lớn — người đã học xong phải học lại. Biên soạn chỉ được GỬI ĐỀ XUẤT; Admin sẽ duyệt và phát hành."
              }
              tone="warning"
            />
          </div>
        )}

        {/* Bước 2: nội dung — luôn giữ trong DOM để không mất nội dung Tiptap khi chuyển bước */}
        {!approving && (
          <div ref={contentRef} className={cn(step !== 1 && "hidden")}>
            <FormGrid>
              <FormField
                label="Tóm tắt thay đổi"
                htmlFor="version-summary"
                required
                error={errors.summary}
                hint={kind === "MINOR" ? "Người học đọc phần này rồi bấm xác nhận." : "Người học thấy phần này khi được yêu cầu học lại."}
              >
                <div id="version-summary">
                  <DocumentEditor name="summary" initialHtml="" invalid={!!errors.summary} />
                </div>
              </FormField>
              <FormField
                label={kind === "MAJOR" ? "Hạn học lại (số ngày)" : "Hạn xác nhận (số ngày)"}
                htmlFor="version-due"
                required
                error={errors.dueInDays}
                hint={daysValid ? `Hạn: hết ngày ${dueText} (giờ Việt Nam).` : "Từ 1 đến 365 ngày."}
              >
                <Input
                  id="version-due"
                  type="number"
                  min={1}
                  max={365}
                  value={dueInDays}
                  onChange={(e) => setDueInDays(e.target.value)}
                  className="w-32"
                  aria-invalid={!!errors.dueInDays}
                />
              </FormField>
            </FormGrid>
          </div>
        )}

        {/* Bước 3: xác nhận */}
        {step === 2 && (
          <div className="grid gap-4">
            <div
              className={cn(
                "rounded-md p-6 text-center",
                kind === "MAJOR" && !proposing ? "bg-destructive/8 text-destructive" : "bg-primary/8 text-primary",
              )}
              aria-live="polite"
            >
              {loading || !impact ? (
                <p className="flex items-center justify-center gap-2 text-[15px] text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  Đang đếm số người bị ảnh hưởng…
                </p>
              ) : proposing ? (
                <>
                  <p className="text-xl font-medium">Gửi đề xuất MAJOR cho Admin duyệt</p>
                  <p className="mt-2 text-[15px] text-foreground">
                    Nếu được duyệt: <strong>{formatNumber(impact.completed)} người</strong> sẽ phải học lại, hạn {dueText}.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[28px] leading-tight font-medium">
                    {formatNumber(impact.completed)} người {affectedVerb}
                  </p>
                  <p className="mt-1 text-lg">hạn {dueText}</p>
                  {kind === "MAJOR" && (
                    <p className="mt-3 text-[15px] text-foreground">
                      {formatNumber(impact.inProgress)} người đang học giữ nguyên tiến độ. Lịch sử điểm, chứng nhận cũ được giữ lại.
                    </p>
                  )}
                </>
              )}
            </div>

            {approving && (
              <FormGrid cols={2}>
                <FormField label="Hạn học lại (số ngày)" htmlFor="approve-due" required error={errors.dueInDays} hint={`Hạn: hết ngày ${dueText}.`}>
                  <Input
                    id="approve-due"
                    type="number"
                    min={1}
                    max={365}
                    value={dueInDays}
                    onChange={(e) => setDueInDays(e.target.value)}
                    aria-invalid={!!errors.dueInDays}
                  />
                </FormField>
              </FormGrid>
            )}

            {(approving || summaryHtml) && (
              <div className="rounded-md border border-border p-4">
                <p className="mb-2 text-[13px] font-medium text-muted-foreground">Tóm tắt thay đổi</p>
                <LessonContent html={summaryHtml} />
              </div>
            )}

            {requiresCode && (
              <FormField
                label={`Gõ mã khoá “${course.code}” để xác nhận`}
                htmlFor="confirm-code"
                required
                error={errors.confirmCode}
                hint="Bản MAJOR đặt lại tiến độ của mọi người đã học xong — không hoàn tác được."
              >
                <Input
                  id="confirm-code"
                  value={confirmCode}
                  onChange={(e) => setConfirmCode(e.target.value)}
                  autoComplete="off"
                  className="max-w-xs uppercase"
                  aria-invalid={!!errors.confirmCode}
                />
              </FormField>
            )}
            {kind === "MAJOR" && !proposing && (
              <p className="flex items-start gap-2 text-[13px] text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Người học nhận thông báo ngay sau khi phát hành.
              </p>
            )}
          </div>
        )}
      </DialogBody>

      <DialogFooter>
        {step > 0 && !approving ? (
          <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
            <ArrowLeft />
            Quay lại
          </Button>
        ) : (
          <DialogClose render={<Button type="button" variant="outline" disabled={submitting} />}>Huỷ</DialogClose>
        )}
        {step < 2 ? (
          <Button type="button" onClick={next} disabled={step === 0 && !kind}>
            Tiếp tục
            <ArrowRight data-icon="inline-end" />
          </Button>
        ) : (
          <Button
            type="button"
            onClick={submit}
            disabled={!canSubmit || submitting}
            variant={kind === "MAJOR" && !proposing ? "destructive" : "default"}
          >
            {submitting ? <Loader2 className="animate-spin" /> : proposing ? <Send /> : <RefreshCcw />}
            {submitting ? "Đang xử lý..." : proposing ? "Gửi đề xuất cho Admin" : approving ? "Duyệt & phát hành" : "Phát hành"}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}

function KindCard({
  selected,
  disabled,
  disabledReason,
  onSelect,
  icon,
  title,
  description,
  tone = "primary",
}: {
  selected: boolean;
  disabled: boolean;
  disabledReason: string;
  onSelect: () => void;
  icon: ReactElement;
  title: string;
  description: string;
  tone?: "primary" | "warning";
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      onClick={onSelect}
      className={cn(
        "flex flex-col items-start gap-2 rounded-md border p-4 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-45",
        selected ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground",
      )}
    >
      <span
        className={cn(
          "flex size-10 items-center justify-center rounded-md",
          tone === "warning" ? "bg-warning/16 text-warning" : "bg-primary/16 text-primary",
        )}
      >
        {icon}
      </span>
      <span className="text-[15px] font-medium text-foreground">{title}</span>
      <span className="text-[13px] text-muted-foreground">{description}</span>
      {disabled && <span className="text-[13px] text-destructive">{disabledReason}</span>}
    </button>
  );
}
