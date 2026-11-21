/** Kiểu dùng chung giữa form quy tắc (client) và server actions. */

export type RuleConditions = {
  courseId: string;
  /** "" = Toàn tập đoàn (chỉ Admin tập đoàn) */
  targetCompanyId: string;
  departmentId: string;
  positionId: string;
  includeSubDepartments: boolean;
};

export type RulePreview =
  | { ok: false; message: string }
  | {
      ok: true;
      matched: number;
      /** Giao mới (kể cả kích hoạt lại lượt đã huỷ) */
      newCount: number;
      /** Đã có lượt đang học / chưa bắt đầu */
      existingCount: number;
      completedCount: number;
      target: string;
      coursePublished: boolean;
      users: {
        id: string;
        fullName: string;
        employeeCode: string;
        companyCode: string;
        departmentName: string | null;
        positionName: string | null;
      }[];
    };

export type RuleFormValue = {
  id: string;
  name: string;
  courseId: string;
  dueInDays: number;
  targetCompanyId: string;
  departmentId: string;
  includeSubDepartments: boolean;
  positionId: string;
  isActive: boolean;
};

export type RuleFormOptions = {
  isGroupAdmin: boolean;
  actorCompanyId: string;
  groupCompanyId: string;
  defaultDays: number;
  courses: { id: string; code: string; title: string; ownerCompanyId: string; ownerCode: string; published: boolean }[];
  companies: { id: string; code: string; name: string }[];
  departments: { id: string; companyId: string; parentId: string | null; name: string; isActive: boolean }[];
  positions: { id: string; name: string; isActive: boolean }[];
};
