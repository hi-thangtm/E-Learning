import { BookOpen } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { ProgressBar } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { ENROLLMENT_STATUS_LABELS, isOverdue, SOURCE_LABELS } from "@/lib/enrollment-labels";
import { formatDate, formatPercent } from "@/lib/format";
import type { MemberEnrollmentRow } from "@/lib/member-detail";
import { cn } from "@/lib/utils";

/**
 * Bảng lượt học của 1 người (dùng chung /team/members/[id] và /org/users/[id] — Việc 33 F1).
 * Đặt trong khung có padding 6 (bảng tràn ra mép bằng -mx-6, cuộn ngang khi hẹp).
 * 5 cột để vừa cột 8/12 ở /org/users/[id]: nguồn ở dòng phụ dưới tên khoá, tiến độ + ngày hoàn thành dưới trạng thái.
 */
export function EnrollmentTable({ rows, now = new Date() }: { rows: MemberEnrollmentRow[]; now?: Date }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        size="sm"
        title="Chưa được giao khoá học nào"
        description="Khoá được giao (thủ công, theo quy tắc hoặc tự đăng ký) sẽ hiện ở đây kèm tiến độ và hạn hoàn thành."
      />
    );
  }

  return (
    <div className="-mx-6 overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-y border-border text-left text-[13px] font-medium text-foreground uppercase">
            <th className="px-6 py-3">Khoá học</th>
            <th className="px-3 py-3" title="Trạng thái và tiến độ">Trạng thái</th>
            <th className="px-3 py-3">Hạn</th>
            <th className="px-3 py-3">Phiên bản</th>
            <th className="px-6 py-3" title="Điểm cao nhất của từng bài kiểm tra">Điểm</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const overdue = isOverdue(e, now);
            const known = e.acknowledgedVersion ?? 0;
            const behind = e.status === "COMPLETED" && known < e.course.currentVersion;
            return (
              <tr key={e.id} className="border-b border-border align-top last:border-0">
                <td className="max-w-56 px-6 py-3">
                  <span className="block truncate font-medium text-foreground" title={e.course.title}>
                    {e.course.title}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
                    {e.course.code}
                    {e.learningPath && <span title={e.learningPath.title}>· Lộ trình {e.learningPath.code}</span>}
                    <StatusBadge tone={SOURCE_LABELS[e.source].tone}>{SOURCE_LABELS[e.source].label}</StatusBadge>
                  </span>
                </td>
                <td className="px-3 py-3">
                  <StatusBadge tone={ENROLLMENT_STATUS_LABELS[e.status].tone}>{ENROLLMENT_STATUS_LABELS[e.status].label}</StatusBadge>
                  <div className="mt-1.5 flex items-center gap-2">
                    <ProgressBar value={e.progressPercent} className="w-20" label={`Tiến độ khoá ${e.course.title}`} />
                    <span className="text-[13px] tabular-nums">{formatPercent(e.progressPercent, 0)}</span>
                  </div>
                  {e.completedAt && <span className="mt-1 block text-[12px] whitespace-nowrap text-muted-foreground">Xong {formatDate(e.completedAt)}</span>}
                </td>
                <td className={cn("px-3 py-3 whitespace-nowrap", overdue ? "text-destructive" : "text-muted-foreground")}>
                  {e.dueDate ? formatDate(e.dueDate) : "—"}
                  {overdue && <span className="block text-[12px] font-medium">Quá hạn</span>}
                </td>
                <td className={cn("px-3 py-3 whitespace-nowrap tabular-nums", behind ? "font-medium text-warning" : "text-muted-foreground")}>
                  {/* Chưa học xong bản nào → “Chưa học / v1” thay vì “v0 / v1” (ui-review #65) */}
                  {e.course.currentVersion > 0 ? `${known > 0 ? `v${known}` : "Chưa học"} / v${e.course.currentVersion}` : "—"}
                  {behind && known > 0 && <span className="block text-[12px]">Chưa nắm bản mới</span>}
                </td>
                <td className="px-6 py-3 text-[13px]">
                  {e.scores.length === 0 ? (
                    <span className="text-foreground/45">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {e.scores.map((s) => (
                        <li key={s.title} className="flex justify-between gap-3">
                          <span className="max-w-32 truncate text-muted-foreground" title={s.title}>
                            {s.title}
                          </span>
                          <span className="font-medium text-foreground tabular-nums">{formatPercent(s.score, 0)}</span>
                        </li>
                      ))}
                    </ul>
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
