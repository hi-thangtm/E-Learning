"use client";

import { useState, type ReactNode } from "react";
import { Check, Copy, Home, RotateCcw } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Tooltip } from "@/components/ui/tooltip";

/** Mã lỗi (digest) Next.js gắn cho lỗi ở server — dùng để quản trị tra log. Không bao giờ hiện `message` / stack. */
export function errorDigest(error: unknown): string | null {
  if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string") return error.digest;
  return null;
}

/**
 * Khung trang lỗi / không tìm thấy (design-system: thẻ trắng giữa trang, ô icon tròn tonal, nút chính + nút phụ).
 * Dùng cho src/app/(app)/error.tsx, (learn)/error.tsx, global-error.tsx, not-found.tsx.
 */
export function ErrorView({
  icon,
  tone = "destructive",
  title,
  description,
  digest,
  onRetry,
  homeHref = "/dashboard",
  homeLabel = "Về Tổng quan",
  className,
}: {
  icon: ReactNode;
  tone?: "destructive" | "warning" | "primary";
  title: string;
  description: string;
  digest?: string | null;
  onRetry?: () => void;
  homeHref?: string;
  /** Chữ nút quay về — VD “Về danh sách quy tắc” cho trang “Không tìm thấy” của 1 mục */
  homeLabel?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-[60vh] items-center justify-center p-6", className)}>
      <section className="flex w-full max-w-lg flex-col items-center gap-4 rounded-md bg-card px-8 py-12 text-center shadow-md">
        <span
          className={cn(
            "flex size-16 items-center justify-center rounded-full [&_svg]:size-8",
            tone === "destructive" && "bg-destructive/16 text-destructive",
            tone === "warning" && "bg-warning/16 text-warning",
            tone === "primary" && "bg-primary/16 text-primary",
          )}
        >
          {icon}
        </span>
        <h1 className="text-2xl font-medium text-foreground">{title}</h1>
        <p className="text-[15px] text-muted-foreground">{description}</p>
        {digest && <DigestBox digest={digest} />}
        <div className="mt-2 flex flex-wrap justify-center gap-3">
          {onRetry && (
            <Button onClick={onRetry}>
              <RotateCcw />
              Thử lại
            </Button>
          )}
          {/* <a> thay vì <Link>: rời hẳn trang đang lỗi, tải lại toàn bộ */}
          <a href={homeHref} className={buttonVariants({ variant: onRetry ? "outline" : "default" })}>
            <Home />
            {homeLabel}
          </a>
        </div>
      </section>
    </div>
  );
}

function DigestBox({ digest }: { digest: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2 text-[13px] text-muted-foreground">
      <span>
        Mã lỗi: <span className="font-mono text-foreground select-all">{digest}</span>
      </span>
      <Tooltip label="Sao chép mã lỗi"><Button
        variant="ghost"
        size="icon-xs"
        aria-label="Sao chép mã lỗi"
        onClick={() => {
          navigator.clipboard
            ?.writeText(digest)
            .then(() => setCopied(true))
            .catch(() => {});
        }}
      >
        {copied ? <Check /> : <Copy />}
      </Button></Tooltip>
    </div>
  );
}
