import type { Role } from "@prisma/client";

/**
 * Vai trò & menu theo đặc tả chức năng (mục 1 — Sơ đồ menu).
 * File này dùng được cả ở server và trình duyệt (chỉ chứa dữ liệu).
 */

export const ROLE_LABELS: Record<Role, string> = {
  GROUP_ADMIN: "Admin tập đoàn",
  COMPANY_ADMIN: "Admin công ty",
  CONTENT_EDITOR: "Biên soạn nội dung",
  MANAGER: "Quản lý",
  LEARNER: "Học viên",
};

const ALL: Role[] = ["LEARNER", "MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"];
const TEAM: Role[] = ["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"];
const CONTENT: Role[] = ["CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"];
const ADMINS: Role[] = ["COMPANY_ADMIN", "GROUP_ADMIN"];
const GROUP_ONLY: Role[] = ["GROUP_ADMIN"];

export type IconName =
  | "lark"
  | "dashboard"
  | "courses"
  | "paths"
  | "library"
  | "certificate"
  | "team"
  | "members"
  | "content"
  | "questions"
  | "categories"
  | "assign"
  | "rules"
  | "users"
  | "departments"
  | "positions"
  | "reports"
  | "companies"
  | "template"
  | "audit"
  | "settings"
  | "jobs"
  | "overview";

export type MenuItem = { label: string; href: string; icon: IconName; roles: Role[] };
/** `id` ổn định (không đổi khi đổi nhãn) — dùng để nhớ nhóm nào đang thu gọn. */
export type MenuGroup = { id: string; label: string; items: MenuItem[] };

/**
 * Nhãn mục menu = tiêu đề trang (PageHeader). URL giữ nguyên khi đổi nhãn / chuyển nhóm.
 * Thứ tự nhóm: việc của bản thân → theo dõi → giao khoá → soạn nội dung → tổ chức → hệ thống.
 */
export const MENU: MenuGroup[] = [
  {
    id: "hoc-tap",
    label: "Học tập",
    items: [
      { label: "Tổng quan", href: "/dashboard", icon: "dashboard", roles: ALL },
      { label: "Khoá học của tôi", href: "/my-courses", icon: "courses", roles: ALL },
      { label: "Lộ trình của tôi", href: "/learning-paths", icon: "paths", roles: ALL },
      { label: "Thư viện khoá học", href: "/library", icon: "library", roles: ALL },
      { label: "Chứng nhận của tôi", href: "/certificates", icon: "certificate", roles: ALL },
    ],
  },
  {
    // Trưởng phòng: các phòng mình phụ trách; Admin công ty: cả công ty; Admin tập đoàn: cả tập đoàn
    id: "theo-doi",
    label: "Theo dõi học tập",
    items: [
      { label: "Tổng quan tập đoàn", href: "/system/overview", icon: "overview", roles: GROUP_ONLY },
      { label: "Tình hình học tập", href: "/team", icon: "team", roles: TEAM },
      { label: "Tiến độ từng người", href: "/team/members", icon: "members", roles: TEAM },
      { label: "Báo cáo", href: "/reports", icon: "reports", roles: TEAM },
    ],
  },
  {
    id: "giao-khoa",
    label: "Giao khoá",
    items: [
      { label: "Giao khoá học", href: "/assign/manual", icon: "assign", roles: ADMINS },
      { label: "Quy tắc giao tự động", href: "/assign/rules", icon: "rules", roles: ADMINS },
    ],
  },
  {
    id: "noi-dung",
    label: "Soạn nội dung",
    items: [
      { label: "Khoá học", href: "/content/courses", icon: "content", roles: CONTENT },
      { label: "Ngân hàng câu hỏi", href: "/content/questions", icon: "questions", roles: CONTENT },
      { label: "Lộ trình học", href: "/content/paths", icon: "paths", roles: CONTENT },
      { label: "Danh mục khoá học", href: "/content/categories", icon: "categories", roles: CONTENT },
    ],
  },
  {
    id: "to-chuc",
    label: "Tổ chức",
    items: [
      { label: "Công ty con", href: "/system/companies", icon: "companies", roles: GROUP_ONLY },
      { label: "Người dùng", href: "/org/users", icon: "users", roles: ADMINS },
      { label: "Phòng ban", href: "/org/departments", icon: "departments", roles: ADMINS },
      { label: "Chức danh", href: "/org/positions", icon: "positions", roles: ADMINS },
    ],
  },
  {
    id: "he-thong",
    label: "Hệ thống",
    items: [
      { label: "Mẫu chứng nhận", href: "/system/certificate-templates", icon: "template", roles: ADMINS },
      { label: "Nhật ký thao tác", href: "/system/audit-logs", icon: "audit", roles: ADMINS },
      { label: "Tác vụ hằng ngày", href: "/system/jobs", icon: "jobs", roles: GROUP_ONLY },
      { label: "Kết nối Lark", href: "/system/lark", icon: "lark", roles: GROUP_ONLY },
      { label: "Cài đặt hệ thống", href: "/system/settings", icon: "settings", roles: GROUP_ONLY },
    ],
  },
];

/** Menu đã lọc theo vai trò (bỏ nhóm rỗng). */
export function menuForRole(role: Role): MenuGroup[] {
  return MENU.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length > 0);
}

/** Mục menu khớp đường dẫn nhất (khớp dài nhất). */
export function findMenuItem(pathname: string): MenuItem | undefined {
  return MENU.flatMap((group) => group.items)
    .filter((item) => pathname === item.href || pathname.startsWith(item.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

/** Vai trò này có được vào đường dẫn này không. */
export function canAccess(pathname: string, role: Role): boolean {
  const item = findMenuItem(pathname);
  return item ? item.roles.includes(role) : true;
}
