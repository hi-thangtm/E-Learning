"use client";

import { useState, useTransition } from "react";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { saveMyReviewAction } from "@/app/(app)/my-courses/[courseId]/actions";
import { StarInput } from "@/components/star-rating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const MAX = 1000;

/**
 * Form đánh giá khoá (Việc 25): 5 sao + nhận xét (đếm ký tự) + Gửi.
 * Gửi xong: gọi `onSaved` (nếu có) hoặc hiện “Cảm ơn bạn đã đánh giá”.
 */
export function ReviewForm({
  courseId,
  initial,
  onSaved,
  onCancel,
  submitLabel = "Gửi đánh giá",
}: {
  courseId: string;
  initial?: { rating: number; comment: string | null } | null;
  onSaved?: (review: { rating: number; comment: string | null }) => void;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? "");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p role="status" className="flex items-center justify-center gap-2 rounded-md bg-success/16 px-4 py-3 text-[15px] font-medium text-success">
        <CheckCircle2 className="size-5" />
        Cảm ơn bạn đã đánh giá
      </p>
    );
  }

  function submit() {
    if (!rating) return setError("Vui lòng chọn số sao.");
    setError(null);
    startTransition(async () => {
      try {
        const r = await saveMyReviewAction(courseId, rating, comment);
        if (!r.ok) return setError(r.message ?? "Không gửi được đánh giá.");
        const saved = { rating, comment: comment.trim() || null };
        if (onSaved) {
          toast.success("Đã lưu đánh giá của bạn.");
          onSaved(saved);
        } else setDone(true);
      } catch {
        setError("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <StarInput value={rating} onChange={setRating} disabled={pending} />
      <div className="grid gap-1">
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, MAX))}
          maxLength={MAX}
          rows={3}
          disabled={pending}
          placeholder="Chia sẻ cảm nhận của bạn về khoá học (không bắt buộc)"
          aria-label="Nhận xét"
        />
        <div className="flex justify-between gap-3 text-[12px] text-muted-foreground">
          <span>Nhận xét được gửi kèm tên bạn tới người quản lý khoá học.</span>
          <span className={cn("shrink-0 tabular-nums", comment.length >= MAX && "text-warning")}>
            {comment.length}/{MAX}
          </span>
        </div>
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
      <div className="flex justify-end gap-3">
        {onCancel && (
          <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>
            Huỷ
          </Button>
        )}
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? "Đang gửi..." : submitLabel}
        </Button>
      </div>
    </div>
  );
}
