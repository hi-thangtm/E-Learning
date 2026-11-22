/**
 * Danh sách cài đặt hệ thống (Việc 28A — feature-spec 6.4) — NƠI DUY NHẤT khai báo khoá, nhóm, nhãn, mô tả, giới hạn, mặc định.
 * Thuần dữ liệu (không zod, không prisma) để dùng được cả ở trình duyệt (form Cài đặt). Đọc / kiểm tra ở server: src/lib/settings.ts.
 */

export type SettingGroup = "branding" | "course" | "reminder" | "cleanup";

export const SETTING_GROUPS: { id: SettingGroup; title: string; description: string }[] = [
  { id: "branding", title: "Nhận diện", description: "Tên và logo hiện ở thanh bên, trang đăng nhập, trang tra cứu chứng nhận và tiêu đề tab trình duyệt." },
  { id: "course", title: "Mặc định khoá học", description: "Giá trị điền sẵn khi giao khoá và khi tạo bài video mới." },
  { id: "reminder", title: "Nhắc nhở", description: "Các mốc tác vụ hằng ngày dùng để gửi thông báo nhắc học viên." },
  { id: "cleanup", title: "Dọn dẹp", description: "Thời gian giữ thông báo trước khi tác vụ hằng ngày xoá." },
];

type Base = { group: SettingGroup; label: string; description: string };
export type NumberSettingMeta = Base & { kind: "number"; min: number; max: number; unit: string; default: number };
export type StringSettingMeta = Base & { kind: "string"; minLength: number; maxLength: number; default: string };
export type LogoSettingMeta = Base & { kind: "logo"; default: null };
export type SettingMeta = NumberSettingMeta | StringSettingMeta | LogoSettingMeta;

export const SETTING_META = {
  SYSTEM_NAME: {
    group: "branding",
    kind: "string",
    label: "Tên hệ thống",
    description: "Hiện cạnh logo và ở tiêu đề tab trình duyệt.",
    minLength: 2,
    maxLength: 50,
    default: "E-Learning",
  },
  SYSTEM_LOGO_KEY: {
    group: "branding",
    kind: "logo",
    label: "Logo",
    description: "Ảnh PNG hoặc WEBP, tối đa 500KB, nên có nền trong suốt. Để trống = biểu tượng mặc định.",
    default: null,
  },
  DEFAULT_DUE_DAYS: {
    group: "course",
    kind: "number",
    label: "Hạn hoàn thành mặc định",
    description: "Số ngày điền sẵn khi giao khoá / tạo quy tắc, hạn học lại khi chứng nhận hết hạn, và hạn dự phòng khi thêm khoá vào lộ trình.",
    min: 1,
    max: 365,
    unit: "ngày",
    default: 30,
  },
  DEFAULT_MIN_WATCH_PERCENT: {
    group: "course",
    kind: "number",
    label: "% xem video tối thiểu",
    description: "Điền sẵn khi tạo bài video mới — học viên phải xem đủ % này mới tính hoàn thành bài.",
    min: 50,
    max: 100,
    unit: "%",
    default: 90,
  },
  DUE_SOON_DAYS: {
    group: "reminder",
    kind: "number",
    label: "Nhắc sắp đến hạn trước",
    description: "Gửi thông báo “sắp đến hạn” khi còn số ngày này.",
    min: 1,
    max: 30,
    unit: "ngày",
    default: 3,
  },
  OVERDUE_REMIND_INTERVAL_DAYS: {
    group: "reminder",
    kind: "number",
    label: "Nhắc lại khi quá hạn mỗi",
    description: "Sau lần nhắc đầu tiên ngày quá hạn, nhắc lại theo chu kỳ này (áp dụng cả bản cập nhật MINOR quá hạn xác nhận).",
    min: 1,
    max: 30,
    unit: "ngày",
    default: 7,
  },
  CERT_EXPIRING_DAYS: {
    group: "reminder",
    kind: "number",
    label: "Nhắc chứng nhận sắp hết hạn trước",
    description: "Gửi thông báo khi chứng nhận còn số ngày này là hết hạn.",
    min: 7,
    max: 180,
    unit: "ngày",
    default: 30,
  },
  NOTIFICATION_READ_RETENTION_DAYS: {
    group: "cleanup",
    kind: "number",
    label: "Giữ thông báo đã đọc",
    description: "Thông báo đã đọc cũ hơn số ngày này sẽ bị xoá.",
    min: 30,
    max: 730,
    unit: "ngày",
    default: 180,
  },
  NOTIFICATION_UNREAD_RETENTION_DAYS: {
    group: "cleanup",
    kind: "number",
    label: "Giữ thông báo chưa đọc",
    description: "Thông báo chưa đọc cũ hơn số ngày này sẽ bị xoá.",
    min: 90,
    max: 1095,
    unit: "ngày",
    default: 365,
  },
} as const satisfies Record<string, SettingMeta>;

export type SettingKey = keyof typeof SETTING_META;
export const SETTING_KEYS = Object.keys(SETTING_META) as SettingKey[];

/** Kiểu giá trị của từng khoá. */
export type SettingValues = { [K in SettingKey]: (typeof SETTING_META)[K]["kind"] extends "number" ? number : (typeof SETTING_META)[K]["kind"] extends "string" ? string : string | null };

export function settingKeysOf(group: SettingGroup): SettingKey[] {
  return SETTING_KEYS.filter((k) => SETTING_META[k].group === group);
}

/** URL logo công khai (kèm phiên bản để trình duyệt lấy ảnh mới khi đổi logo). */
export function logoUrl(logoKey: string | null): string | null {
  return logoKey ? `/api/branding/logo?v=${encodeURIComponent(logoKey.slice(logoKey.lastIndexOf("/") + 1, logoKey.lastIndexOf(".")))}` : null;
}
