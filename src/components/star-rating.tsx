"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

/** Sao hiển thị (chỉ đọc). Điểm lẻ làm tròn tới nửa sao. */
export function StarRating({ value, size = "md", className }: { value: number; size?: "sm" | "md" | "lg"; className?: string }) {
  const sizeClass = size === "sm" ? "size-3.5" : size === "lg" ? "size-6" : "size-4.5";
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} role="img" aria-label={`${value} trên 5 sao`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? 1 : rounded >= i - 0.5 ? 0.5 : 0;
        return (
          <span key={i} className={cn("relative inline-block", sizeClass)}>
            <Star className={cn("absolute inset-0 text-foreground/20", sizeClass)} />
            {fill > 0 && (
              <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 1 ? "100%" : "50%" }}>
                <Star className={cn("fill-warning text-warning", sizeClass)} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}

const STAR_LABELS = ["", "Rất tệ", "Chưa tốt", "Bình thường", "Tốt", "Rất tốt"];

/** Chọn sao 1–5: bấm, rê chuột xem trước, phím ← → (radiogroup). */
export function StarInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [hover, setHover] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const shown = hover || value;

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>, star: number) {
    const step = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = Math.min(5, Math.max(1, star + step));
    onChange(next);
    refs.current[next - 1]?.focus();
  }

  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Số sao" className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            ref={(el) => {
              refs.current[star - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={`${star} sao — ${STAR_LABELS[star]}`}
            tabIndex={value ? (value === star ? 0 : -1) : star === 1 ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(star)}
            onMouseEnter={() => setHover(star)}
            onKeyDown={(e) => onKeyDown(e, star)}
            className="rounded-sm p-0.5 transition-transform outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none"
          >
            <Star className={cn("size-7 transition-colors", star <= shown ? "fill-warning text-warning" : "text-foreground/25")} />
          </button>
        ))}
      </div>
      <span className="min-w-20 text-[13px] text-muted-foreground">{shown ? STAR_LABELS[shown] : "Chọn số sao"}</span>
    </div>
  );
}
