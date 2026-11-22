"use client";

import { useRouter } from "next/navigation";
import { XCircle } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { cancelSelfEnrollmentAction } from "./actions";

/** Nút phụ “Huỷ đăng ký” cho khoá tự đăng ký chưa bắt đầu; huỷ xong về Thư viện. */
export function CancelEnrollmentButton({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button variant="ghost" className="w-full text-muted-foreground">
          <XCircle />
          Huỷ đăng ký
        </Button>
      }
      title="Huỷ đăng ký khoá học?"
      description={`“${courseTitle}” sẽ được gỡ khỏi Khoá học của tôi. Bạn có thể đăng ký lại bất cứ lúc nào trong Thư viện.`}
      confirmLabel="Huỷ đăng ký"
      cancelLabel="Giữ lại"
      tone="destructive"
      action={async () => {
        const r = await cancelSelfEnrollmentAction(courseId);
        if (r.ok) router.push("/library");
        return r;
      }}
    />
  );
}
