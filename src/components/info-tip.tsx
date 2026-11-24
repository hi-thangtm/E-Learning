"use client";

import type { ReactNode } from "react";
import { Tooltip } from "@base-ui/react/tooltip";
import { Info } from "lucide-react";
import { METRICS, type MetricKey } from "@/lib/report-definitions";
import { cn } from "@/lib/utils";

/** Icon ⓘ — rê chuột / focus bàn phím để xem giải thích. */
export function InfoTip({ text, label = "Giải thích", className }: { text: ReactNode; label?: string; className?: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger
        render={
          <button
            type="button"
            aria-label={label}
            className={cn(
              "inline-flex size-4 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring/50",
              className,
            )}
          />
        }
      >
        <Info className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Positioner sideOffset={6} className="z-50">
          <Tooltip.Popup className="max-w-72 rounded-md bg-foreground px-3 py-2 text-[12px] leading-snug font-normal tracking-normal text-background normal-case shadow-lg">
            {text}
          </Tooltip.Popup>
        </Tooltip.Positioner>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Tiêu đề cột báo cáo: nhãn + ⓘ định nghĩa lấy từ src/lib/report-definitions.ts. */
export function MetricHeader({ metric, label }: { metric: MetricKey; label?: string }) {
  const def = METRICS[metric];
  return (
    <span className="inline-flex items-center gap-1">
      {label ?? def.label}
      {/* Tiêu đề cột rút gọn → tooltip nhắc lại tên đầy đủ */}
      <InfoTip text={label && label !== def.label ? `${def.label}: ${def.definition}` : def.definition} label={`Định nghĩa: ${def.label}`} />
    </span>
  );
}
