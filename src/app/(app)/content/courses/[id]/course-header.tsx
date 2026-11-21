import Link from "next/link";
import type { CourseStatus } from "@prisma/client";
import { Archive, ArchiveRestore, ChevronLeft, Rocket } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CourseStatusBadge, courseVersionLabel } from "@/components/course-status-badge";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { Button } from "@/components/ui/button";
import { archiveCourseAction, restoreCourseAction } from "./actions";

/** Thanh trên cùng trang soạn: tên, mã, trạng thái, phiên bản, Lưu trữ / Khôi phục, Phát hành (chưa có). */
export function CourseHeader({
  course,
  canEdit,
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
}) {
  const archived = course.status === "ARCHIVED";

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
              <span className="rounded-sm bg-muted px-2 py-0.5">{courseVersionLabel(course.currentVersion)}</span>
              <span title={course.ownerCompany.name}>Công ty {course.ownerCompany.code}</span>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-4">
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
            {/* Nút bị khoá không nhận rê chuột -> đặt chú thích ở thẻ bọc ngoài */}
            <span title="Có ở Việc 21" className="inline-flex cursor-not-allowed">
              <Button disabled aria-describedby="publish-hint">
                <Rocket />
                Phát hành
              </Button>
              <span id="publish-hint" className="sr-only">
                Chức năng phát hành có ở Việc 21
              </span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
