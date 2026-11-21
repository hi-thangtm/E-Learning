import type { CourseStatus } from "@prisma/client";
import { StatusBadge, type StatusTone } from "@/components/status-badge";

/** Trạng thái khoá học: Nháp (xám), Đã phát hành (xanh lá), Lưu trữ (xanh dương nhạt) — design-system mục 5.4. */
const COURSE_STATUS: Record<CourseStatus, { label: string; tone: StatusTone }> = {
  DRAFT: { label: "Nháp", tone: "secondary" },
  PUBLISHED: { label: "Đã phát hành", tone: "success" },
  ARCHIVED: { label: "Lưu trữ", tone: "info" },
};

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const s = COURSE_STATUS[status];
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** “v3” hoặc “v0 — chưa phát hành”. */
export function courseVersionLabel(version: number): string {
  return version > 0 ? `v${version}` : "v0 — chưa phát hành";
}
