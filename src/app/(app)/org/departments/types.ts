import type { Role } from "@prisma/client";

/** Một dòng phòng ban truyền từ page.tsx (server) sang cây (client). */
export type DepartmentRow = {
  id: string;
  parentId: string | null;
  code: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
  managerCode: string | null;
  /** Số nhân viên đang làm của riêng phòng này (không cộng phòng con) */
  activeUsers: number;
  /** Số phòng con trực tiếp đang dùng */
  activeChildren: number;
};

/** Nhân viên đang làm của công ty — để chọn trưởng phòng. */
export type EmployeeOption = {
  id: string;
  fullName: string;
  employeeCode: string;
  role: Role;
};
