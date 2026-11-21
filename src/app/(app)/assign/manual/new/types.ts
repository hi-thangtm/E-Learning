import type { EnrollmentStatus } from "@prisma/client";

/** Kiểu dùng chung giữa trình giao khoá (client) và server actions. */

export type LearnerFilter = { companyId: string; departmentId: string; positionId: string; q: string };

/** Chọn từng người, hoặc “tất cả theo bộ lọc” (server tự tìm người theo bộ lọc). */
export type Selection = { mode: "ids"; ids: string[] } | { mode: "filter"; filter: LearnerFilter };

export type DueChoice = { mode: "days"; days: number } | { mode: "date"; date: string };

export type LearnerRow = {
  id: string;
  fullName: string;
  employeeCode: string;
  companyCode: string;
  departmentName: string | null;
  positionName: string | null;
  /** Trạng thái lượt giao hiện có của khoá đang chọn (null = chưa được giao) */
  enrollmentStatus: EnrollmentStatus | null;
};

export type WizardCourse = {
  id: string;
  code: string;
  title: string;
  ownerCode: string;
  /** Công ty có người học được giao khoá này ("all" = mọi công ty trong phạm vi) */
  learnerCompanies: string[] | "all";
};

export type Option = { id: string; label: string };
export type DepartmentOption = { id: string; companyId: string; parentId: string | null; name: string };
