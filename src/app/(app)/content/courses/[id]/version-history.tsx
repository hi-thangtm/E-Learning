import type { ChangeType, VersionStatus } from "@prisma/client";
import { History } from "lucide-react";
import { LessonContent } from "@/components/learning/lesson-content";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime, formatNumber } from "@/lib/format";

/**
 * Tab "Lịch sử phiên bản": mọi course_versions (phát hành, đề xuất, bị từ chối).
 * Kết quả bản MINOR / MAJOR đếm trên đúng danh sách lượt học bị ảnh hưởng lúc phát hành
 * (lưu trong audit_logs COURSE_VERSION_PUBLISHED.affectedEnrollmentIds).
 */

function badgeOf(type: ChangeType, status: VersionStatus): { label: string; tone: StatusTone } {
  if (status === "PROPOSED") return { label: "Đề xuất", tone: "warning" };
  if (status === "REJECTED") return { label: "Bị từ chối", tone: "destructive" };
  if (type === "INITIAL") return { label: "INITIAL", tone: "secondary" };
  if (type === "MAJOR") return { label: "MAJOR", tone: "destructive" };
  return { label: "MINOR", tone: "info" };
}

function idsOf(metadata: unknown): { versionId: string | null; ids: string[] } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return { versionId: null, ids: [] };
  const m = metadata as Record<string, unknown>;
  return {
    versionId: typeof m.versionId === "string" ? m.versionId : null,
    ids: Array.isArray(m.affectedEnrollmentIds) ? m.affectedEnrollmentIds.filter((x): x is string => typeof x === "string") : [],
  };
}

export async function VersionHistory({ courseId }: { courseId: string }) {
  const [versions, publishLogs] = await Promise.all([
    prisma.courseVersion.findMany({
      where: { courseId },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        versionNo: true,
        changeType: true,
        status: true,
        changeSummary: true,
        dueInDays: true,
        proposedAt: true,
        publishedAt: true,
        reviewNote: true,
        createdAt: true,
        proposedBy: { select: { fullName: true } },
        publishedBy: { select: { fullName: true } },
      },
    }),
    prisma.auditLog.findMany({
      where: { action: "COURSE_VERSION_PUBLISHED", entityType: "Course", entityId: courseId },
      select: { metadata: true },
    }),
  ]);

  // versionId -> danh sách lượt học bị ảnh hưởng lúc phát hành
  const affectedByVersion = new Map<string, string[]>();
  for (const log of publishLogs) {
    const { versionId, ids } = idsOf(log.metadata);
    if (versionId) affectedByVersion.set(versionId, ids);
  }

  // Đếm đã xác nhận (MINOR) / đã học xong lại (MAJOR)
  const progress = new Map<string, { done: number; total: number }>();
  for (const v of versions) {
    if (v.status !== "PUBLISHED" || v.changeType === "INITIAL" || v.versionNo === null) continue;
    const ids = affectedByVersion.get(v.id);
    if (!ids) continue;
    const done =
      ids.length === 0
        ? 0
        : await prisma.enrollment.count({
            where: {
              id: { in: ids },
              ...(v.changeType === "MINOR" ? { acknowledgedVersion: { gte: v.versionNo } } : { completedVersion: { gte: v.versionNo } }),
            },
          });
    progress.set(v.id, { done, total: ids.length });
  }

  if (versions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
          <History className="size-8" />
        </div>
        <p className="text-lg font-medium text-foreground">Khoá học chưa phát hành phiên bản nào</p>
        <p className="max-w-sm text-[15px] text-muted-foreground">Bấm “Phát hành” ở thanh trên để phát hành phiên bản 1.</p>
      </div>
    );
  }

  return (
    <div className="-mx-6 -mb-6 overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-y border-border">
            {["Phiên bản", "Loại", "Tóm tắt thay đổi", "Đề xuất / phát hành bởi", "Ngày", "Hạn", "Kết quả"].map((h) => (
              <th
                key={h}
                scope="col"
                className="h-14 px-4 text-left align-middle text-[13px] font-medium tracking-[0.2px] whitespace-nowrap text-foreground uppercase first:pl-6 last:pr-6"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {versions.map((v) => {
            const badge = badgeOf(v.changeType, v.status);
            const p = progress.get(v.id);
            const date = v.publishedAt ?? v.proposedAt ?? v.createdAt;
            return (
              <tr key={v.id} className="border-b border-border align-top text-[15px] last:border-0">
                <td className="py-3 pr-4 pl-6 font-medium whitespace-nowrap text-foreground">{v.versionNo ? `v${v.versionNo}` : "—"}</td>
                <td className="px-4 py-3">
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </td>
                <td className="max-w-md px-4 py-3 text-muted-foreground">
                  {v.changeSummary ? (
                    <details>
                      <summary className="cursor-pointer text-[13px] font-medium text-primary">Xem tóm tắt</summary>
                      <div className="mt-2 rounded-md bg-muted/50 p-3">
                        <LessonContent html={v.changeSummary} />
                      </div>
                    </details>
                  ) : (
                    <span className="text-foreground/45">{v.changeType === "INITIAL" ? "Phát hành lần đầu" : "—"}</span>
                  )}
                  {v.status === "REJECTED" && v.reviewNote && (
                    <p className="mt-2 text-[13px] text-destructive">Lý do từ chối: {v.reviewNote}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-[13px] whitespace-nowrap text-muted-foreground">
                  {v.proposedBy && <p>Đề xuất: {v.proposedBy.fullName}</p>}
                  {v.publishedBy && <p>Phát hành: {v.publishedBy.fullName}</p>}
                  {!v.proposedBy && !v.publishedBy && "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground" title={formatDateTime(date)}>
                  {formatDate(date)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                  {v.dueInDays ? `${v.dueInDays} ngày` : "—"}
                  {v.publishedAt && v.dueInDays ? (
                    <span className="block text-[13px]">
                      đến {formatDate(new Date(v.publishedAt.getTime() + v.dueInDays * 86_400_000))}
                    </span>
                  ) : null}
                </td>
                <td className="py-3 pr-6 pl-4 whitespace-nowrap text-muted-foreground">
                  {p ? (
                    <span className="text-foreground">
                      {v.changeType === "MINOR" ? "đã xác nhận" : "đã học xong lại"}{" "}
                      <strong className="font-medium tabular-nums">
                        {formatNumber(p.done)} / {formatNumber(p.total)}
                      </strong>{" "}
                      người
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
