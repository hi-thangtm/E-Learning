import {
  AlarmClockOff,
  Award,
  Bell,
  BookPlus,
  Clock,
  FileDiff,
  GitPullRequest,
  ListPlus,
  LockOpen,
  RefreshCcw,
  ShieldAlert,
  Trophy,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import type { StatusTone } from "@/components/status-badge";

/**
 * Loại thông báo + nhãn + icon — dùng được cả server lẫn trình duyệt.
 * Thêm loại mới: thêm vào đây trước (notify() chỉ nhận các loại này).
 */
export const NOTIFICATION_TYPES = {
  COURSE_ASSIGNED: { label: "Được giao khoá học", icon: BookPlus, tone: "primary" },
  QUIZ_ATTEMPTS_GRANTED: { label: "Được cấp thêm lượt làm bài", icon: ListPlus, tone: "info" },
  DUE_SOON: { label: "Sắp đến hạn", icon: Clock, tone: "warning" },
  OVERDUE: { label: "Quá hạn", icon: AlarmClockOff, tone: "destructive" },
  VERSION_MAJOR: { label: "Quy trình thay đổi lớn", icon: RefreshCcw, tone: "warning" },
  VERSION_MINOR: { label: "Quy trình có cập nhật", icon: FileDiff, tone: "info" },
  VERSION_PROPOSED: { label: "Đề xuất cập nhật quy trình", icon: GitPullRequest, tone: "warning" },
  VERSION_REJECTED: { label: "Đề xuất bị từ chối", icon: XCircle, tone: "destructive" },
  CERTIFICATE_ISSUED: { label: "Nhận chứng nhận", icon: Award, tone: "success" },
  CERTIFICATE_EXPIRING: { label: "Chứng nhận sắp hết hạn", icon: ShieldAlert, tone: "warning" },
  PATH_NEXT_UNLOCKED: { label: "Mở khoá học tiếp theo", icon: LockOpen, tone: "success" },
  PATH_COMPLETED: { label: "Hoàn thành lộ trình", icon: Trophy, tone: "success" },
  REMINDER: { label: "Nhắc nhở", icon: Bell, tone: "primary" },
} as const satisfies Record<string, { label: string; icon: LucideIcon; tone: StatusTone }>;

export type NotificationType = keyof typeof NOTIFICATION_TYPES;

export const NOTIFICATION_TYPE_KEYS = Object.keys(NOTIFICATION_TYPES) as NotificationType[];

/** Thông tin hiển thị theo loại (loại lạ -> chuông). */
export function notificationMeta(type: string): { label: string; icon: LucideIcon; tone: StatusTone } {
  return NOTIFICATION_TYPES[type as NotificationType] ?? { label: "Thông báo", icon: Bell, tone: "primary" };
}

/** Lớp tonal cho ô icon theo màu. */
export const TONE_ICON_CLASSES: Record<StatusTone, string> = {
  primary: "bg-primary/16 text-primary",
  info: "bg-info/16 text-info",
  success: "bg-success/16 text-success",
  warning: "bg-warning/16 text-warning",
  destructive: "bg-destructive/16 text-destructive",
  secondary: "bg-secondary text-secondary-foreground",
};

/**
 * Link nội bộ an toàn: bắt đầu bằng "/" nhưng không phải "//" hay "/\" (tránh chuyển sang trang ngoài).
 * Sai -> null (thông báo không có link).
 */
export function safeLink(link: string | null | undefined): string | null {
  if (!link) return null;
  const value = link.trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.length > 500 || /[\s<>"]/.test(value)) return null;
  return value;
}

/** Thông báo gửi sang trình duyệt. */
export type NotificationView = {
  id: string;
  type: string;
  title: string;
  link: string | null;
  read: boolean;
  createdAt: string;
};
