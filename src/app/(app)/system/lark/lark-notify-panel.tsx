"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { formatDateTime, formatNumber } from "@/lib/format";
import { NOTIFICATION_TYPE_KEYS, NOTIFICATION_TYPES, type NotificationType } from "@/lib/notification-types";
import { retryFailedLarkAction, saveLarkNotifySettingsAction, sendLarkTestAction } from "./notify-actions";

export type LarkNotifyStats = { sentToday: number; pending: number; failed: number; skipped: number };
export type LarkNotifyFailure = { id: string; who: string; type: string; error: string | null; at: string };

/** Khối "Gửi thông báo qua Lark" (Việc L2) trên trang Kết nối Lark. */
export function LarkNotifyPanel({
  configured,
  enabled: initialEnabled,
  types: initialTypes,
  since,
  stats,
  failures,
}: {
  configured: boolean;
  enabled: boolean;
  types: NotificationType[];
  since: string | null;
  stats: LarkNotifyStats;
  failures: LarkNotifyFailure[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [types, setTypes] = useState<Set<NotificationType>>(new Set(initialTypes));
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [retrying, startRetry] = useTransition();
  const dirty = enabled !== initialEnabled || types.size !== initialTypes.length || initialTypes.some((t) => !types.has(t));

  const toggleType = (t: NotificationType, on: boolean) =>
    setTypes((prev) => {
      const next = new Set(prev);
      if (on) next.add(t);
      else next.delete(t);
      return next;
    });

  const run = (start: typeof startSave, fn: () => Promise<{ ok: boolean; message: string }>) =>
    start(async () => {
      try {
        const r = await fn();
        if (r.ok) toast.success(r.message);
        else toast.error(r.message);
        router.refresh();
      } catch {
        toast.error("Không thực hiện được, vui lòng thử lại.");
      }
    });

  const STAT_ITEMS = [
    ["Đã gửi hôm nay", stats.sentToday, "text-success"],
    ["Đang chờ gửi", stats.pending, "text-foreground"],
    ["Lỗi", stats.failed, stats.failed > 0 ? "text-destructive" : "text-foreground"],
    ["Bỏ qua (chưa liên kết Lark…)", stats.skipped, "text-muted-foreground"],
  ] as const;

  return (
    <section className="rounded-md bg-card shadow-md" aria-labelledby="lark-notify-title">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-6">
        <div className="min-w-0">
          <h2 id="lark-notify-title" className="text-lg font-medium text-foreground">
            Gửi thông báo qua Lark
          </h2>
          <p className="max-w-3xl text-[13px] text-muted-foreground">
            Thông báo trong phần mềm (VD được giao khoá) được gửi thêm thành tin nhắn Lark có nút “Mở trong E-Learning”, tới người đã liên kết Lark.
            Cần bật Bot + quyền <code className="font-mono">im:message:send_as_bot</code> cho app Lark (docs/lark-setup.md).
            {since && ` Đang gửi các thông báo tạo từ ${formatDateTime(since)}.`}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => run(startTest, sendLarkTestAction)} disabled={!configured || testing}>
          {testing ? <Loader2 className="animate-spin" /> : <Send />}
          {testing ? "Đang gửi..." : "Gửi thử cho tôi"}
        </Button>
      </header>

      <div className="grid gap-6 p-6">
        <label className="flex items-center gap-3 text-[15px] text-foreground">
          <Switch checked={enabled} onCheckedChange={setEnabled} disabled={!configured} aria-label="Bật gửi thông báo qua Lark" />
          <span className="font-medium">{enabled ? "Đang bật gửi qua Lark" : "Đang tắt gửi qua Lark"}</span>
          {!configured && <span className="text-[13px] text-muted-foreground">(cấu hình kết nối Lark trước)</span>}
        </label>

        <fieldset className="grid gap-2" disabled={!configured}>
          <legend className="mb-2 text-[13px] text-muted-foreground">Loại thông báo gửi qua Lark (mọi loại vẫn hiện ở chuông trong phần mềm)</legend>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 md:grid-cols-2 xl:grid-cols-3">
            {NOTIFICATION_TYPE_KEYS.map((t) => (
              <label key={t} className="flex items-center gap-3 text-[15px] text-foreground">
                <Switch checked={types.has(t)} onCheckedChange={(on) => toggleType(t, on)} aria-label={`Gửi qua Lark: ${NOTIFICATION_TYPES[t].label}`} />
                {NOTIFICATION_TYPES[t].label}
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          <Button type="button" onClick={() => run(startSave, () => saveLarkNotifySettingsAction({ enabled, types: [...types] }))} disabled={!configured || saving || !dirty}>
            {saving ? <Loader2 className="animate-spin" /> : <Save />}
            {saving ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-t border-border pt-6 lg:grid-cols-4" data-testid="lark-notify-stats">
          {STAT_ITEMS.map(([label, value, tone]) => (
            <div key={label} className="rounded-md border border-border p-4">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className={`mt-1 text-2xl font-medium tabular-nums ${tone}`}>{formatNumber(value)}</dd>
            </div>
          ))}
        </dl>

        {failures.length > 0 && (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium text-foreground">Tin gửi lỗi gần đây</p>
              <Button type="button" variant="outline" size="sm" onClick={() => run(startRetry, retryFailedLarkAction)} disabled={retrying}>
                {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}
                {retrying ? "Đang xếp hàng..." : "Gửi lại tin lỗi"}
              </Button>
            </div>
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left font-medium text-foreground uppercase">
                    <th className="h-10 px-4">Thời gian</th>
                    <th className="h-10 px-4">Người nhận</th>
                    <th className="h-10 px-4">Loại</th>
                    <th className="h-10 px-4">Lý do</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f) => (
                    <tr key={f.id} className="border-b border-border last:border-0">
                      <td className="h-10 px-4 whitespace-nowrap text-muted-foreground">{formatDateTime(f.at)}</td>
                      <td className="px-4 whitespace-nowrap text-foreground">{f.who}</td>
                      <td className="px-4 whitespace-nowrap text-muted-foreground">{NOTIFICATION_TYPES[f.type as NotificationType]?.label ?? f.type}</td>
                      <td className="px-4 py-2 text-destructive">{f.error ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
