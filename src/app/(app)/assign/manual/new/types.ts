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
  /** Giao lộ trình: HAS = đã có lộ trình, DONE = đã xong mọi khoá của lộ trình */
  pathState: "HAS" | "DONE" | null;
};

/** Đối tượng giao: khoá học hoặc lộ trình (Việc 23A). */
export type TargetKind = "course" | "path";
export type Target = { kind: TargetKind; id: string };

export type WizardCourse = {
  kind: TargetKind;
  id: string;
  code: string;
  title: string;
  ownerCode: string;
  /** Lộ trình: số khoá */
  courseCount: number;
  /** Công ty có học viên được giao khoá này ("all" = mọi công ty trong phạm vi) */
  learnerCompanies: string[] | "all";
};

export type Option = { id: string; label: string };
export type DepartmentOption = { id: string; companyId: string; parentId: string | null; name: string };
