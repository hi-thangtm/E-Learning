"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Nút "Tải PDF" + "Sao chép link tra cứu" của 1 chứng nhận (dùng ở trang học viên và trang quản trị). */
export function CertificateActions({
  certificateId,
  code,
  size = "sm",
  showCopy = true,
}: {
  certificateId: string;
  code: string;
  size?: "sm" | "default";
  showCopy?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const link = `${window.location.origin}/verify/${encodeURIComponent(code)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success("Đã sao chép link tra cứu.", { description: link });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Không sao chép được — hãy chép tay: " + link);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={`/api/certificates/${certificateId}/pdf`} download className={cn(buttonVariants({ size }))}>
        <Download />
        Tải PDF
      </a>
      {showCopy && (
        <Button type="button" variant="outline" size={size} onClick={copy}>
          {copied ? <Check /> : <Copy />}
          Sao chép link tra cứu
        </Button>
      )}
    </div>
  );
}
