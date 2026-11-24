"use client";

import Image from "next/image";
import { Expand } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import shotsManifest from "@/lib/help/shots-manifest.json";
import type { ShotName } from "@/lib/help/types";
import { cn } from "@/lib/utils";

/**
 * Ảnh chụp màn hình minh hoạ (public/images/help/<tên>.jpg, kích thước từ shots-manifest.json).
 * Bấm ảnh → phóng to trong hộp thoại. Ảnh điện thoại hiển thị hẹp.
 */
export function HelpShot({ name, caption, className }: { name: ShotName; caption: string; className?: string }) {
  const meta = shotsManifest[name];
  const src = `/images/help/${name}.jpg`;
  return (
    <figure className={cn("min-w-0 space-y-2", meta.mobile ? "w-full max-w-[260px] sm:w-[260px] sm:shrink-0" : "w-full sm:min-w-0 sm:flex-1", className)}>
      <Dialog>
        <DialogTrigger
          render={
            <button
              type="button"
              aria-label={`Phóng to ảnh: ${caption}`}
              className="group relative block w-full cursor-zoom-in overflow-hidden rounded-md border border-border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          }
        >
          <Image
            src={src}
            alt={caption}
            width={meta.w}
            height={meta.h}
            sizes={meta.mobile ? "260px" : "(min-width: 1024px) 900px, 100vw"}
            className="h-auto w-full"
          />
          <span className="absolute top-2 right-2 flex size-8 items-center justify-center rounded-md bg-card/90 text-muted-foreground opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
            <Expand className="size-4" />
          </span>
        </DialogTrigger>
        <DialogContent className={cn("gap-3 p-3 sm:p-4", meta.mobile ? "sm:max-w-[420px]" : "sm:max-w-[min(1240px,calc(100%-2rem))]")}>
          <DialogTitle className="pr-8 text-[15px]">{caption}</DialogTitle>
          <Image src={src} alt={caption} width={meta.w} height={meta.h} sizes="(min-width: 1280px) 1240px, 100vw" className="h-auto w-full rounded-md border border-border" />
        </DialogContent>
      </Dialog>
      <figcaption className="text-center text-[13px] text-muted-foreground">{caption}</figcaption>
    </figure>
  );
}
