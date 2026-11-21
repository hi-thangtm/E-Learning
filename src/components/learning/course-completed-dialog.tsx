"use client";

import Link from "next/link";
import { PartyPopper } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Màn hình chúc mừng khi vừa hoàn thành khoá (feature-spec 2.4). */
export function CourseCompletedDialog({
  courseTitle,
  completedAt,
  onClose,
}: {
  courseTitle: string;
  completedAt: string;
  onClose: () => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
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

        {/* Việc 22: nút "Tải chứng nhận" (khoá có cấp chứng nhận) */}
        {/* Việc 25: form "Đánh giá khoá" (1–5 sao + nhận xét) */}

        <DialogFooter className="sm:justify-center">
          <Link href="/my-courses" className={cn(buttonVariants(), "w-full sm:w-auto")}>
            Về khoá học của tôi
          </Link>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
