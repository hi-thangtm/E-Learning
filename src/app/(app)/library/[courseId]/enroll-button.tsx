"use client";

import { useRouter } from "next/navigation";
import { BookPlus } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { enrollAction } from "./actions";

/** Nút “Đăng ký học” + hộp xác nhận ngắn; đăng ký xong chuyển tới trang khoá trong Khoá học của tôi. */
export function EnrollButton({ courseId, courseTitle }: { courseId: string; courseTitle: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      trigger={
        <Button className="w-full">
          <BookPlus />
          Đăng ký học
        </Button>
      }
      title="Đăng ký khoá học?"
      description={`“${courseTitle}” sẽ được thêm vào Khoá học của tôi. Khoá tự đăng ký không có hạn hoàn thành.`}
      confirmLabel="Đăng ký"
      action={async () => {
        const r = await enrollAction(courseId);
        if (r.ok && r.href) router.push(r.href);
        return { ok: r.ok, message: r.message };
      }}
    />
  );
}
