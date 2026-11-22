"use client";

import { BellRing } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { remindAcknowledgeAction } from "./actions";

/** Nút “Nhắc xác nhận” — gửi thông báo tới người chưa xác nhận bản MINOR mới nhất của khoá. */
export function AckReminderButton({
  courseId,
  courseTitle,
  filterParams,
  count,
}: {
  courseId: string;
  courseTitle: string;
  /** Bộ lọc báo cáo đang xem */
  filterParams: Record<string, string>;
  /** Số người chưa xác nhận (MINOR) */
  count: number;
}) {
  return (
    <ConfirmDialog
      trigger={
        <Button disabled={count === 0}>
          <BellRing />
          Nhắc xác nhận ({count})
        </Button>
      }
      title="Nhắc xác nhận bản cập nhật?"
      description={`Gửi thông báo tới ${count} người đã học xong “${courseTitle}” nhưng chưa xác nhận bản cập nhật mới nhất. Người đã nhắc hôm nay sẽ được bỏ qua.`}
      confirmLabel="Gửi nhắc nhở"
      action={remindAcknowledgeAction.bind(null, courseId, filterParams)}
    />
  );
}
