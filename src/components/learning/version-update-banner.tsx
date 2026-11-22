import Link from "next/link";
import { ArrowRight, FileDiff } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import type { PendingAcknowledgement } from "@/lib/acknowledgements";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Banner "Quy trình có cập nhật" (feature-spec 2.2 / 2.8): các khoá cần đọc & xác nhận bản MINOR, kèm hạn (quá hạn tô đỏ).
 * Dùng ở Tổng quan (mọi khoá) và trang giới thiệu khoá (1 khoá).
 */
export function VersionUpdateBanner({ items, single = false }: { items: PendingAcknowledgement[]; single?: boolean }) {
  if (items.length === 0) return null;
  const anyOverdue = items.some((i) => i.overdue);

  return (
    <section
      role="status"
      className={cn(
        "rounded-md border p-5",
        anyOverdue ? "border-destructive/40 bg-destructive/8" : "border-info/40 bg-info/8",
      )}
    >
      <div className="flex items-start gap-3">
        <FileDiff className={cn("mt-0.5 size-5 shrink-0", anyOverdue ? "text-destructive" : "text-info")} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[15px] font-medium", anyOverdue ? "text-destructive" : "text-info")}>Quy trình có cập nhật</p>
          <p className="text-[13px] text-foreground">
            {single
              ? "Khoá học này có phiên bản mới. Hãy đọc phần thay đổi và xác nhận đã nắm được."
              : "Các khoá bạn đã học xong có phiên bản mới. Hãy đọc phần thay đổi và xác nhận đã nắm được."}
          </p>
          <ul className="mt-3 grid gap-2">
            {items.map((i) => (
              <li key={i.courseId} className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-card px-4 py-2.5">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {!single && <span className="truncate text-[15px] font-medium text-foreground">{i.courseTitle}</span>}
                  <span className="text-[13px] text-muted-foreground">
                    v{i.acknowledgedVersion} → v{i.currentVersion}
                  </span>
                  {i.dueDate && (
                    <StatusBadge tone={i.overdue ? "destructive" : "warning"}>
                      {i.overdue ? `Quá hạn xác nhận (${formatDate(i.dueDate)})` : `Hạn xác nhận ${formatDate(i.dueDate)}`}
                    </StatusBadge>
                  )}
                </div>
                <Link href={`/my-courses/${i.courseId}/updates`} className={cn(buttonVariants({ size: "sm" }), "shrink-0")}>
                  Xem thay đổi
                  <ArrowRight data-icon="inline-end" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
