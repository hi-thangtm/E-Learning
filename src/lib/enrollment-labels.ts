import type { EnrollmentSource, EnrollmentStatus } from "@prisma/client";
import type { StatusTone } from "@/components/status-badge";

/** Nhãn + màu badge cho lượt giao khoá — dùng chung server / trình duyệt. */

export const SOURCE_LABELS: Record<EnrollmentSource, { label: string; tone: StatusTone }> = {
  RULE: { label: "Tự động", tone: "info" },
  ASSIGNED: { label: "Thủ công", tone: "primary" },
  SELF: { label: "Tự đăng ký", tone: "secondary" },
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, { label: string; tone: StatusTone }> = {
  NOT_STARTED: { label: "Chưa bắt đầu", tone: "secondary" },
  IN_PROGRESS: { label: "Đang học", tone: "primary" },
  COMPLETED: { label: "Hoàn thành", tone: "success" },
  CANCELLED: { label: "Đã huỷ", tone: "destructive" },
};

/** Quá hạn = có hạn, hạn đã qua, chưa xong / chưa huỷ (docs/database.md — Quy tắc 6, tính khi truy vấn). */
export function isOverdue(e: { status: EnrollmentStatus; dueDate: Date | string | null }, now = new Date()): boolean {
  return !!e.dueDate && new Date(e.dueDate) < now && (e.status === "NOT_STARTED" || e.status === "IN_PROGRESS");
}

/** Nhãn nguồn phía HỌC VIÊN (cách gọi khác phía quản trị). */
export const LEARNER_SOURCE_LABELS: Record<EnrollmentSource, { label: string; tone: StatusTone }> = {
  RULE: { label: "Bắt buộc", tone: "primary" },
  ASSIGNED: { label: "Được giao", tone: "secondary" },
  SELF: { label: "Tự đăng ký", tone: "info" },
};
