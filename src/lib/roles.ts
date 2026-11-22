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
export type MenuGroup = { label: string; items: MenuItem[] };

export const MENU: MenuGroup[] = [
  {
    label: "Học tập",
    items: [
      { label: "Tổng quan", href: "/dashboard", icon: "dashboard", roles: ALL },
      { label: "Khoá học của tôi", href: "/my-courses", icon: "courses", roles: ALL },
      { label: "Lộ trình", href: "/learning-paths", icon: "paths", roles: ALL },
      { label: "Thư viện", href: "/library", icon: "library", roles: ALL },
      { label: "Chứng nhận", href: "/certificates", icon: "certificate", roles: ALL },
    ],
  },
  {
    label: "Đội của tôi",
    items: [
      { label: "Tổng quan đội", href: "/team", icon: "team", roles: TEAM },
      { label: "Nhân viên", href: "/team/members", icon: "members", roles: TEAM },
    ],
  },
  {
    label: "Nội dung",
    items: [
      { label: "Khoá học", href: "/content/courses", icon: "content", roles: CONTENT },
      { label: "Ngân hàng câu hỏi", href: "/content/questions", icon: "questions", roles: CONTENT },
      { label: "Lộ trình", href: "/content/paths", icon: "paths", roles: CONTENT },
      { label: "Danh mục", href: "/content/categories", icon: "categories", roles: CONTENT },
    ],
  },
  {
    label: "Giao khoá",
    items: [
      { label: "Danh sách giao khoá", href: "/assign/manual", icon: "assign", roles: ADMINS },
      { label: "Giao tự động", href: "/assign/rules", icon: "rules", roles: ADMINS },
    ],
  },
  {
    label: "Tổ chức",
    items: [
      { label: "Người dùng", href: "/org/users", icon: "users", roles: ADMINS },
      { label: "Phòng ban", href: "/org/departments", icon: "departments", roles: ADMINS },
      { label: "Chức danh", href: "/org/positions", icon: "positions", roles: ADMINS },
    ],
  },
  {
    label: "Báo cáo",
    items: [{ label: "Báo cáo", href: "/reports", icon: "reports", roles: TEAM }],
  },
  {
    label: "Hệ thống",
    items: [
      { label: "Dashboard tập đoàn", href: "/system/overview", icon: "overview", roles: GROUP_ONLY },
      { label: "Công ty con", href: "/system/companies", icon: "companies", roles: GROUP_ONLY },
      { label: "Mẫu chứng nhận", href: "/system/certificate-templates", icon: "template", roles: ADMINS },
      { label: "Nhật ký", href: "/system/audit-logs", icon: "audit", roles: ADMINS },
      { label: "Tác vụ hằng ngày", href: "/system/jobs", icon: "jobs", roles: GROUP_ONLY },
      { label: "Cài đặt", href: "/system/settings", icon: "settings", roles: GROUP_ONLY },
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
