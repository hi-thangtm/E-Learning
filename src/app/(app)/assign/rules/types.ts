/** Kiểu dùng chung giữa form quy tắc (client) và server actions. */

/** Quy tắc giao khoá học hoặc lộ trình (Việc 23A) — không đổi được sau khi tạo. */
export type RuleKind = "course" | "path";

export type RuleConditions = {
  kind: RuleKind;
  /** Khoá học (kind = course) hoặc lộ trình (kind = path) */
  subjectId: string;
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
      kind: RuleKind;
      matched: number;
      /** Giao mới (kể cả kích hoạt lại lượt đã huỷ). Lộ trình: người chưa có lộ trình */
      newCount: number;
      /** Đã có lượt đang học / chưa bắt đầu. Lộ trình: người đã có lộ trình */
      existingCount: number;
      /** Đã hoàn thành (lộ trình: hoàn thành mọi khoá) */
      completedCount: number;
      target: string;
      /** Khoá / lộ trình đang phát hành */
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
  kind: RuleKind;
  subjectId: string;
  dueInDays: number;
  targetCompanyId: string;
  departmentId: string;
  includeSubDepartments: boolean;
  positionId: string;
  isActive: boolean;
};

export type RuleSubjectOption = { id: string; code: string; title: string; ownerCompanyId: string; ownerCode: string; published: boolean };

export type RuleFormOptions = {
  isGroupAdmin: boolean;
  actorCompanyId: string;
  groupCompanyId: string;
  defaultDays: number;
  courses: RuleSubjectOption[];
  paths: RuleSubjectOption[];
  companies: { id: string; code: string; name: string }[];
  departments: { id: string; companyId: string; parentId: string | null; name: string; isActive: boolean }[];
  positions: { id: string; name: string; isActive: boolean }[];
};
