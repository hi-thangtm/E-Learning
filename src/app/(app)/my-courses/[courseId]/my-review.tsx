"use client";

import { useState } from "react";
import { Pencil, Star } from "lucide-react";
import { ReviewForm } from "@/components/learning/review-form";
import { StarRating } from "@/components/star-rating";
import { Button } from "@/components/ui/button";

/** “Đánh giá của bạn” ở trang giới thiệu khoá (đã học xong): chưa có → form; có → sao + nhận xét + Sửa. */
export function MyReview({ courseId, initial }: { courseId: string; initial: { rating: number; comment: string | null } | null }) {
  const [review, setReview] = useState(initial);
  const [editing, setEditing] = useState(!initial);

  return (
    <section className="rounded-md bg-card p-6 shadow-md">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-medium text-foreground">
            <Star className="size-5 text-warning" />
            Đánh giá của bạn
          </h2>
          {!review && <p className="text-[13px] text-muted-foreground">Bạn đã học xong khoá này — cho biết cảm nhận để khoá học tốt hơn.</p>}
        </div>
        {review && !editing && (
          <Button variant="outline" onClick={() => setEditing(true)}>
            <Pencil />
            Sửa
          </Button>
        )}
      </div>

      {editing ? (
        <div className="max-w-2xl">
          <ReviewForm
            courseId={courseId}
            initial={review}
            submitLabel={review ? "Lưu đánh giá" : "Gửi đánh giá"}
            onCancel={review ? () => setEditing(false) : undefined}
            onSaved={(saved) => {
              setReview(saved);
              setEditing(false);
            }}
          />
        </div>
      ) : (
        review && (
          <div className="grid gap-2">
            <StarRating value={review.rating} size="lg" />
            {review.comment ? (
              <p className="text-[15px] whitespace-pre-line text-foreground">{review.comment}</p>
            ) : (
              <p className="text-[15px] text-muted-foreground italic">Bạn chưa viết nhận xét.</p>
            )}
          </div>
        )
      )}
    </section>
  );
}
