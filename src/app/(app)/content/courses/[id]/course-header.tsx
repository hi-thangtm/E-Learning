import Link from "next/link";
import type { CourseStatus } from "@prisma/client";
import { Archive, ArchiveRestore, ChevronLeft, ListChecks, RefreshCcw } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CourseStatusBadge, courseVersionLabel } from "@/components/course-status-badge";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { archiveCourseAction, restoreCourseAction } from "./actions";
import { PublishButton } from "./publish-dialog";
import { VersionDialog } from "./version-dialog";

/** Thanh trên cùng trang soạn: tên, mã, trạng thái, phiên bản, Ngân hàng câu hỏi, Lưu trữ / Khôi phục, Phát hành lần đầu. */
export function CourseHeader({
  course,
  canEdit,
  questionCount,
  update,
}: {
  course: {
    id: string;
    code: string;
    title: string;
    status: CourseStatus;
    currentVersion: number;
    thumbnailUrl: string | null;
    ownerCompany: { code: string; name: string };
  };
  canEdit: boolean;
  /** Số câu hỏi đang dùng trong ngân hàng của khoá */
  questionCount: number;
  /** Bản cập nhật MINOR / MAJOR (khoá đã phát hành) — quyền tính ở server (src/lib/versioning.ts) */
  update: {
    updatable: boolean;
    allowMinor: boolean;
    allowMajor: boolean;
    allowPropose: boolean;
    majorBlockedReason: string | null;
    defaultDueDays: number;
  };
}) {
  const archived = course.status === "ARCHIVED";

  // Nút Phát hành chỉ tắt khi không có quyền hoặc khoá không ở Nháp v0 — luôn kèm lý do (chú thích khi rê chuột)
  const publishDisabledReason = !canEdit
    ? `Chỉ công ty sở hữu khoá (${course.ownerCompany.code}) hoặc Admin tập đoàn mới phát hành được khoá này.`
    : archived
      ? "Khoá đang lưu trữ — khôi phục trước khi phát hành."
      : course.currentVersion > 0 || course.status !== "DRAFT"
        ? "Khoá đã phát hành. Phát hành phiên bản mới (MINOR / MAJOR) có ở Việc 21."
        : null;

  return (
    <div className="mb-6 space-y-3">
      <Link href="/content/courses" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-4" />
        Khoá học
      </Link>

      <div className="flex items-center justify-between gap-6 rounded-md bg-card p-6 shadow-md">
        <div className="flex min-w-0 items-center gap-4">
          <CourseThumbnail thumbnailKey={course.thumbnailUrl} alt="" className="w-28" />
          <div className="min-w-0 space-y-1.5">
            <h1 className="truncate text-2xl font-medium text-foreground" title={course.title}>
              {course.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <span>{course.code}</span>
              <CourseStatusBadge status={course.status} />
              <span className="inline-flex shrink-0 items-center rounded-sm bg-muted px-2 py-0.5 whitespace-nowrap">{courseVersionLabel(course.currentVersion)}</span>
              <span title={course.ownerCompany.name}>Công ty {course.ownerCompany.code}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-4">
          <Link href={`/content/questions?course=${course.id}`} className={buttonVariants({ variant: "secondary" })}>
            <ListChecks />
            Ngân hàng câu hỏi ({formatNumber(questionCount)} câu)
          </Link>
        {canEdit && (
          <>
            <ConfirmDialog
              trigger={
                <Button variant="outline">
                  {archived ? <ArchiveRestore /> : <Archive />}
                  {archived ? "Khôi phục" : "Lưu trữ"}
                </Button>
              }
              title={archived ? `Khôi phục khoá học ${course.code}?` : `Lưu trữ khoá học ${course.code}?`}
              description={
                archived
                  ? course.currentVersion > 0
                    ? "Khoá học trở lại trạng thái Đã phát hành và hiện lại trong thư viện (nếu cho tự đăng ký)."
                    : "Khoá học trở lại trạng thái Nháp để tiếp tục soạn."
                  : "Khoá học sẽ ẩn khỏi thư viện, không giao mới được. Tiến độ, điểm và chứng nhận đã có vẫn giữ nguyên. Có thể khôi phục bất cứ lúc nào."
              }
              confirmLabel={archived ? "Khôi phục" : "Lưu trữ"}
              tone={archived ? "default" : "destructive"}
              action={(archived ? restoreCourseAction : archiveCourseAction).bind(null, course.id)}
            />
          </>
        )}
          {course.currentVersion > 0 ? (
            <UpdateButton course={course} update={update} />
          ) : (
            <PublishButton
              course={{ id: course.id, code: course.code, title: course.title }}
              disabledReason={publishDisabledReason}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** Khoá đã phát hành: "Phát hành bản cập nhật" (MINOR / MAJOR / đề xuất MAJOR). Tắt kèm lý do khi không được dùng. */
function UpdateButton({
  course,
  update,
}: {
  course: { id: string; code: string; title: string; status: CourseStatus };
  update: { updatable: boolean; allowMinor: boolean; allowMajor: boolean; allowPropose: boolean; majorBlockedReason: string | null; defaultDueDays: number };
}) {
  const reason =
    course.status === "ARCHIVED"
      ? "Khoá đang lưu trữ — khôi phục trước khi phát hành bản cập nhật."
      : !update.updatable
        ? "Chỉ khoá đã phát hành mới phát hành bản cập nhật."
        : !update.allowMinor && !update.allowMajor && !update.allowPropose
          ? "Chỉ Biên soạn / Admin của công ty sở hữu khoá hoặc Admin tập đoàn mới phát hành bản cập nhật."
          : null;

  if (reason) {
    // Nút bị khoá không nhận rê chuột -> đặt chú thích ở thẻ bọc ngoài
    return (
      <span title={reason} className="inline-flex cursor-not-allowed">
        <Button disabled aria-describedby="update-disabled-reason">
          <RefreshCcw />
          Phát hành bản cập nhật
        </Button>
        <span id="update-disabled-reason" className="sr-only">
          {reason}
        </span>
      </span>
    );
  }

  return (
    <VersionDialog
      course={{ id: course.id, code: course.code, title: course.title }}
      mode={{
        kind: "new",
        allowMinor: update.allowMinor,
        allowMajor: update.allowMajor,
        allowPropose: update.allowPropose,
        majorBlockedReason: update.majorBlockedReason,
        defaultDueDays: update.defaultDueDays,
      }}
      trigger={
        <Button>
          <RefreshCcw />
          Phát hành bản cập nhật
        </Button>
      }
    />
  );
}
