"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { acknowledgeVersionAction } from "./actions";

const WAIT_SECONDS = 10;

/** Nút "Tôi đã đọc và nắm được" — bật sau 10 giây để học viên đọc phần thay đổi. */
export function AckButton({ courseId }: { courseId: string }) {
  const [left, setLeft] = useState(WAIT_SECONDS);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  function submit() {
    startTransition(async () => {
      try {
        const r = await acknowledgeVersionAction(courseId);
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        toast.success(r.message);
        router.push(`/my-courses/${courseId}`);
      } catch {
        toast.error("Không xác nhận được, vui lòng thử lại.");
      }
    });
  }

  return (
    <Button size="lg" onClick={submit} disabled={left > 0 || pending}>
      {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
      {pending ? "Đang xác nhận..." : left > 0 ? `Tôi đã đọc và nắm được (${left}s)` : "Tôi đã đọc và nắm được"}
    </Button>
  );
}
