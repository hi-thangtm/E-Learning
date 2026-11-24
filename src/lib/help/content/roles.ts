import type { Role } from "@prisma/client";

/** Nhóm vai trò dùng trong nội dung hướng dẫn — khớp MENU ở src/lib/roles.ts. */
export const ALL: Role[] = ["LEARNER", "MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"];
export const TEAM: Role[] = ["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"];
export const CONTENT: Role[] = ["CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"];
export const ADMINS: Role[] = ["COMPANY_ADMIN", "GROUP_ADMIN"];
export const GROUP: Role[] = ["GROUP_ADMIN"];
export const STAFF: Role[] = ["MANAGER", "CONTENT_EDITOR", "COMPANY_ADMIN", "GROUP_ADMIN"];
