"use client";

import { useState } from "react";
import { CircleCheck, CircleX, Play } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { DailyJobCounts, DailyJobResult } from "@/lib/jobs/daily";
import { cn } from "@/lib/utils";
import { runDailyJobAction } from "./actions";

/** Nút "Chạy ngay" + kết quả từng phần của lần chạy vừa bấm. */
export function RunJobPanel({ parts, summary }: { parts: { key: keyof DailyJobCounts; label: string }[]; summary: string }) {
  const [result, setResult] = useState<Extract<DailyJobResult, { ok: true }> | null>(null);

  return (
    <section className="mb-6 rounded-md bg-card p-6 shadow-md">
      <div className="flex items-start justify-between gap-6">
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-foreground">Chạy tác vụ</h2>
          <p className="text-[15px] text-muted-foreground">
            {summary} Chạy nhiều lần trong ngày không gửi trùng thông báo.
          </p>
        </div>
        <ConfirmDialog
          trigger={
            <Button className="shrink-0">
              <Play />
              Chạy ngay
            </Button>
          }
          title="Chạy tác vụ hằng ngày ngay bây giờ?"
          description="Hệ thống sẽ gửi thông báo nhắc hạn / chứng nhận và đặt lại khoá học có chứng nhận đã hết hạn. Thông báo đã gửi trước đó không bị gửi lại."
          confirmLabel="Chạy ngay"
          action={async () => {
            const r = await runDailyJobAction();
            if (!r.ok) return { message: r.message };
            setResult(r);
            const failed = Object.keys(r.errors).length;
            return {
              ok: true,
              message: failed > 0 ? `Đã chạy xong, ${failed} phần bị lỗi.` : `Đã chạy xong sau ${formatNumber(r.durationMs)} ms.`,
            };
          }}
        />
      </div>

      {result && (
        <div className="mt-6 grid grid-cols-3 gap-4" aria-live="polite">
          {parts.map((p) => {
            const error = result.errors[p.key];
            return (
              <div
                key={p.key}
                className={cn("rounded-md border border-l-4 border-border p-4", error ? "border-l-destructive" : "border-l-success")}
              >
                <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  {error ? <CircleX className="size-4 text-destructive" /> : <CircleCheck className="size-4 text-success" />}
                  {p.label}
                </p>
                <p className="mt-1 text-2xl font-medium text-foreground tabular-nums">{formatNumber(result.counts[p.key])}</p>
                {error && <p className="mt-1 text-[13px] break-words text-destructive">{error}</p>}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
