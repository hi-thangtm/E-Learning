"use client";

import { useState, useTransition } from "react";
import { Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { testLarkConnectionAction } from "./actions";

const RESULT_TEXT = {
  not_configured: "Chưa cấu hình Lark.",
  bad_credentials: "Lark từ chối App ID / App Secret — kiểm tra LARK_APP_ID, LARK_APP_SECRET.",
  no_permission: "Thiếu quyền đọc danh bạ hoặc phạm vi danh bạ chưa là “Toàn bộ thành viên” (xem docs/lark-setup.md).",
  unreachable: "Không gọi được Lark (mạng / tường lửa / sai LARK_DOMAIN). Thử lại sau.",
} as const;

/** Nút "Kiểm tra kết nối": lấy tenant token + đọc phòng ban cấp 1 trên Lark. */
export function LarkTestButton() {
  const [pending, startTransition] = useTransition();
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);

  function run() {
    startTransition(async () => {
      try {
        const r = await testLarkConnectionAction();
        if (!r.ok) return void toast.error(r.message);
        if (r.result.status === "ok") {
          const text = `Kết nối Lark thành công · ${r.result.topDepartments} phòng ban cấp 1.`;
          setLast({ ok: true, text });
          toast.success(text);
        } else {
          const text = RESULT_TEXT[r.result.status] + ("message" in r.result ? ` (${r.result.message})` : "");
          setLast({ ok: false, text });
          toast.error(RESULT_TEXT[r.result.status]);
        }
      } catch {
        toast.error("Không kiểm tra được, vui lòng thử lại.");
      }
    });
  }

  return (
    <div className="flex max-w-md flex-col items-end gap-2">
      <Button type="button" variant="soft-primary" onClick={run} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <PlugZap />}
        {pending ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
      </Button>
      {last && (
        <p role="status" className={last.ok ? "text-right text-[13px] text-success" : "text-right text-[13px] text-destructive"}>
          {last.text}
        </p>
      )}
    </div>
  );
}
