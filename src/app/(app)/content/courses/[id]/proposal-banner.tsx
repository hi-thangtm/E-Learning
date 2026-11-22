"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Clock, GitPullRequest, Loader2, ShieldCheck, XCircle } from "lucide-react";
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
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { rejectProposalAction } from "./version-actions";
import { VersionDialog } from "./version-dialog";

export type PendingProposal = {
  id: string;
  proposerName: string;
  proposedAt: string;
  summaryHtml: string;
  dueInDays: number;
};

/** Banner vàng đầu trang khi khoá có đề xuất MAJOR chờ duyệt. Admin: Duyệt & phát hành / Từ chối. */
export function ProposalBanner({
  course,
  proposal,
  canManage,
}: {
  course: { id: string; code: string; title: string };
  proposal: PendingProposal;
  canManage: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);

  return (
    <section role="status" className="mb-6 rounded-md border border-warning/40 bg-warning/16 p-5">
      <div className="flex items-start justify-between gap-6">
        <div className="flex min-w-0 items-start gap-3">
          <GitPullRequest className="mt-0.5 size-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="text-[15px] font-medium text-warning">Có đề xuất cập nhật MAJOR đang chờ duyệt</p>
            <p className="mt-0.5 text-[13px] text-foreground">
              {proposal.proposerName} đề xuất lúc {formatDateTime(proposal.proposedAt)} · hạn học lại {proposal.dueInDays} ngày sau khi phát hành
            </p>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="mt-1 inline-flex items-center gap-1 text-[13px] font-medium text-primary hover:underline"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {expanded ? "Thu gọn tóm tắt" : "Xem tóm tắt thay đổi"}
            </button>
          </div>
        </div>

        {canManage ? (
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="outline" onClick={() => setRejectOpen(true)}>
              <XCircle />
              Từ chối
            </Button>
            <VersionDialog
              course={course}
              mode={{ kind: "approve", proposal: { id: proposal.id, summaryHtml: proposal.summaryHtml, dueInDays: proposal.dueInDays } }}
              trigger={
                <Button>
                  <ShieldCheck />
                  Duyệt & phát hành
                </Button>
              }
            />
          </div>
        ) : (
          <span className="inline-flex shrink-0 items-center gap-2 rounded-sm bg-card px-3 py-1.5 text-[13px] font-medium whitespace-nowrap text-warning">
            <Clock className="size-4" />
            Đang chờ Admin duyệt
          </span>
        )}
      </div>

      {expanded && (
        <div className="mt-4 rounded-md bg-card p-4">
          <LessonContent html={proposal.summaryHtml} />
        </div>
      )}

      {rejectOpen && <RejectDialog proposalId={proposal.id} onClose={() => setRejectOpen(false)} />}
    </section>
  );
}

function RejectDialog({ proposalId, onClose }: { proposalId: string; onClose: () => void }) {
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const r = await rejectProposalAction(proposalId, note);
        if (r.ok) {
          toast.success(r.message ?? "Đã từ chối đề xuất.");
          onClose();
          router.refresh();
        } else {
          setError(r.errors?.reviewNote ?? null);
          if (r.message) toast.error(r.message);
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Từ chối đề xuất MAJOR</DialogTitle>
          <DialogDescription>Người đề xuất sẽ nhận thông báo kèm lý do.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody>
            <FormGrid>
              <FormField label="Lý do từ chối" htmlFor="reject-note" required error={error ?? undefined} hint="5–1.000 ký tự.">
                <Textarea
                  id="reject-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={1000}
                  rows={4}
                  autoFocus
                  aria-invalid={!!error}
                />
              </FormField>
            </FormGrid>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
            <Button type="submit" variant="destructive" disabled={pending || note.trim().length < 5}>
              {pending ? <Loader2 className="animate-spin" /> : <XCircle />}
              Từ chối đề xuất
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
