import type { Metadata } from "next";
import { DataTableEmpty } from "@/components/data-table/data-table-empty";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { InfoTip } from "@/components/info-tip";
import { formatDateTimeSeconds, formatDecimal, formatNumber } from "@/lib/format";
import { DAILY_JOB_PARTS, type DailyJobCounts } from "@/lib/jobs/daily";
import { getSettings } from "@/lib/settings";
import { RunJobPanel } from "./run-job-panel";

export const metadata: Metadata = { title: "Tác vụ hằng ngày" };

type Meta = { trigger?: string; counts?: Partial<DailyJobCounts>; errors?: Record<string, string>; durationMs?: number };

function asMeta(value: unknown): Meta {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Meta) : {};
}

/** Tác vụ hằng ngày — chỉ Admin tập đoàn: chạy ngay + 30 lần chạy gần nhất (đọc từ audit_logs JOB_DAILY_RUN). */
export default async function JobsPage() {
  await requireRole(["GROUP_ADMIN"]);

  const runs = await prisma.auditLog.findMany({
    where: { action: "JOB_DAILY_RUN" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, createdAt: true, metadata: true, actor: { select: { fullName: true, employeeCode: true } } },
  });

  const parts = DAILY_JOB_PARTS.map(({ key, label }) => ({ key, label }));
  const s = await getSettings();
  const summary = `Nhắc sắp hạn (${s.DUE_SOON_DAYS} ngày) / quá hạn (mỗi ${s.OVERDUE_REMIND_INTERVAL_DAYS} ngày), chấm bài kiểm tra bỏ dở, nhắc chứng nhận sắp hết hạn (${s.CERT_EXPIRING_DAYS} ngày), chứng nhận hết hạn → đặt lại khoá để học lại, dọn thông báo cũ (đã đọc > ${s.NOTIFICATION_READ_RETENTION_DAYS} ngày, chưa đọc > ${s.NOTIFICATION_UNREAD_RETENTION_DAYS} ngày), hỏi lại Bunny các video còn đang xử lý, xoá video Bunny tải dở quá 24 giờ. Đổi các mốc ở Hệ thống › Cài đặt.`;

  return (
    <>
      <PageHeader
        title="Tác vụ hằng ngày"
        description="Hệ thống tự chạy các việc này mỗi ngày một lần (gửi nhắc, chấm bài bỏ dở, xử lý chứng nhận hết hạn, dọn dữ liệu cũ). Bấm “Chạy ngay” nếu cần chạy lại sớm."
      />
      <RunJobPanel parts={parts} summary={summary} />

      <section className="overflow-hidden rounded-md bg-card shadow-md">
        <h2 className="px-6 pt-6 pb-4 text-lg font-medium text-foreground">30 lần chạy gần nhất</h2>
        {runs.length === 0 ? (
          <DataTableEmpty title="Chưa có lần chạy nào" description="Bấm “Chạy ngay” hoặc chờ bộ lập lịch chạy lần đầu." />
        ) : (
          <div className="relative w-full overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-y border-border">
                  {/* Tiêu đề ngắn 1 dòng + ⓘ tên đầy đủ (ui-review #59) */}
                  {[
                    { key: "at", short: "Thời gian", label: "" },
                    { key: "actor", short: "Người chạy", label: "" },
                    ...DAILY_JOB_PARTS,
                    { key: "errors", short: "Lỗi", label: "" },
                    { key: "duration", short: "Thời gian chạy", label: "" },
                  ].map((h, i) => (
                    <th
                      key={h.key}
                      scope="col"
                      className={
                        "h-14 px-4 text-left align-middle text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase first:pl-6 last:pr-6 " +
                        (i >= 2 && i < 2 + DAILY_JOB_PARTS.length ? "text-right" : "")
                      }
                    >
                      <span className="inline-flex items-center gap-1">
                        {h.short}
                        {h.label && <InfoTip text={h.label} label={`Giải thích cột ${h.short}`} />}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const m = asMeta(r.metadata);
                  const errors = Object.entries(m.errors ?? {});
                  return (
                    <tr key={r.id} className="border-b border-border text-[15px] last:border-0 hover:bg-muted/50">
                      <td className="h-[50px] pr-4 pl-6 whitespace-nowrap text-foreground">{formatDateTimeSeconds(r.createdAt)}</td>
                      <td className="px-4 whitespace-nowrap text-muted-foreground">
                        {r.actor ? (
                          `${r.actor.fullName} (${r.actor.employeeCode})`
                        ) : (
                          <span className="italic">{m.trigger === "script" ? "Tự động (chạy tay bằng script)" : "Tự động"}</span>
                        )}
                      </td>
                      {DAILY_JOB_PARTS.map((p) => (
                        <td key={p.key} className="px-4 text-right text-muted-foreground tabular-nums">
                          {formatNumber(m.counts?.[p.key] ?? 0)}
                        </td>
                      ))}
                      <td className="px-4">
                        {errors.length > 0 ? (
                          <span title={errors.map(([k, v]) => `${k}: ${v}`).join("\n")}>
                            <StatusBadge tone="destructive">Có lỗi ({errors.length})</StatusBadge>
                          </span>
                        ) : (
                          <StatusBadge tone="success">Không</StatusBadge>
                        )}
                      </td>
                      <td className="pr-6 pl-4 whitespace-nowrap text-muted-foreground tabular-nums">
                        {m.durationMs != null ? `${formatDecimal(m.durationMs / 1000, 1)} giây` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
