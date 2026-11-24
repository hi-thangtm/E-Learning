"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Loader2, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { testBunnyConnectionAction } from "./bunny-actions";

const RESULT_TEXT = {
  ok: "Kết nối Bunny Stream thành công.",
  not_configured: "Chưa cấu hình Bunny Stream.",
  bad_key: "Bunny từ chối API key — kiểm tra lại ô API key.",
  bad_library: "Không tìm thấy thư viện — kiểm tra lại ô Library ID.",
  unreachable: "Không gọi được Bunny (mạng / tường lửa / Bunny đang lỗi). Thử lại sau.",
} as const;

/** Nút "Kiểm tra kết nối" — gọi server action, kết quả hiện ở thẻ (router.refresh) + toast. */
export function BunnyTestButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const r = await testBunnyConnectionAction();
        if (!r.ok) return void toast.error(r.message);
        if (r.result.status === "ok") toast.success(RESULT_TEXT.ok);
        else toast.error(RESULT_TEXT[r.result.status]);
        router.refresh();
      } catch {
        toast.error("Không kiểm tra được, vui lòng thử lại.");
      }
    });
  }

  return (
    <Button type="button" variant="soft-primary" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <PlugZap />}
      {pending ? "Đang kiểm tra..." : "Kiểm tra kết nối"}
    </Button>
  );
}

/** Địa chỉ webhook + nút sao chép */
export function BunnyCopyWebhook({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const full = url.startsWith("/") ? `${window.location.origin}${url}` : url;
    try {
      await navigator.clipboard.writeText(full);
      setCopied(true);
      toast.success("Đã sao chép địa chỉ webhook.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không sao chép được — hãy chép tay: " + full);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="min-w-0 rounded-md bg-muted px-3 py-2 font-mono text-[13px] break-all text-foreground">{url}</code>
      <Button type="button" variant="outline" size="sm" onClick={copy}>
        {copied ? <Check /> : <Copy />}
        Sao chép
      </Button>
    </div>
  );
}
