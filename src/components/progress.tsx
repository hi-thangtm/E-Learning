import { cn } from "@/lib/utils";

/** Thanh tiến độ (design-system 5.7: cao 8px, bo tròn, màu primary; xong 100% = success). */
export function ProgressBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-label={label ?? "Tiến độ"}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", v >= 100 ? "bg-success" : "bg-primary")} style={{ width: `${v}%` }} />
    </div>
  );
}

/** Vòng tròn tiến độ % (SVG, dùng biến màu theme). */
export function ProgressRing({ value, size = 96, stroke = 8 }: { value: number; size?: number; stroke?: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (c * v) / 100}
          className={v >= 100 ? "stroke-success" : "stroke-primary"}
        />
      </svg>
      <span className="absolute text-lg font-medium text-foreground" role="img" aria-label={`Hoàn thành ${v}%`}>
        {v}%
      </span>
    </div>
  );
}
