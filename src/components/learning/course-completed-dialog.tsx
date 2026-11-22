"use client";

import Link from "next/link";
import { ArrowRight, Award, PartyPopper } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { ReviewForm } from "./review-form";
import { cn } from "@/lib/utils";

/** Màn hình chúc mừng khi vừa hoàn thành khoá (feature-spec 2.4). */
export function CourseCompletedDialog({
  courseTitle,
  completedAt,
  certificateId,
  nextCourse = null,
  courseId,
  myReview = null,
  onClose,
}: {
  courseTitle: string;
  completedAt: string;
  /** Chứng nhận vừa cấp (khoá có cấp chứng nhận) */
  certificateId: string | null;
  /** Lộ trình: khoá tiếp theo vừa được mở */
  nextCourse?: { id: string; title: string } | null;
  courseId: string;
  /** Đánh giá đã có (học lại sau MAJOR) — điền sẵn */
  myReview?: { rating: number; comment: string | null } | null;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader className="items-center pr-0 text-center">
          <span className="mb-2 flex size-16 items-center justify-center rounded-full bg-success/16 text-success">
            <PartyPopper className="size-8" />
          </span>
          <DialogTitle className="text-xl">Chúc mừng bạn đã hoàn thành khoá học!</DialogTitle>
          <DialogDescription className="text-[15px]">
            <span className="block font-medium text-foreground">{courseTitle}</span>
            Hoàn thành ngày {formatDate(new Date(completedAt))}
          </DialogDescription>
        </DialogHeader>

        {certificateId && (
          <div className="flex flex-col items-center gap-2 rounded-md bg-warning/16 p-4 text-center">
            <p className="flex items-center gap-2 text-[15px] font-medium text-warning">
              <Award className="size-5" />
              Bạn đã được cấp chứng nhận hoàn thành
            </p>
            <a href={`/api/certificates/${certificateId}/pdf`} className={buttonVariants({ variant: "default" })} download>
              <Award />
              Tải chứng nhận
            </a>
          </div>
        )}
        <section aria-label="Đánh giá khoá học" className="grid gap-2 rounded-md border border-border p-4">
          <p className="font-medium text-foreground">Đánh giá khoá học</p>
          <ReviewForm courseId={courseId} initial={myReview} />
        </section>

        <DialogFooter className="sm:justify-center">
          {certificateId && (
            <Link href="/certificates" className={cn(buttonVariants({ variant: "outline" }), "w-full sm:w-auto")}>
              Chứng nhận của tôi
            </Link>
          )}
          <Link
            href="/my-courses"
            className={cn(buttonVariants({ variant: certificateId || nextCourse ? "secondary" : "default" }), "w-full sm:w-auto")}
          >
            Về khoá học của tôi
          </Link>
          {nextCourse && (
            <Link href={`/my-courses/${nextCourse.id}`} className={cn(buttonVariants(), "w-full sm:w-auto")} title={nextCourse.title}>
              Học khoá tiếp theo
              <ArrowRight />
            </Link>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
