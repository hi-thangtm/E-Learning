import type { Prisma, Role } from "@prisma/client";
import { ROLE_LABELS } from "@/lib/roles";
import { SETTING_KEYS, SETTING_META } from "@/lib/settings-meta";
import { formatNumber } from "@/lib/format";

/**
 * Nhật ký thao tác (audit_logs) — ghi và hiển thị.
 * - Ghi: MỌI thao tác quản trị dùng `logAudit(tx, …)` (docs/database.md — Quy tắc 6). Chỉ ghi thêm, không sửa / xoá.
 * - Hiển thị: nhãn tiếng Việt, nhóm màu, trình bày metadata (Trước → Sau).
 * File này chỉ `import type` từ Prisma nên dùng được cả ở server lẫn trình duyệt.
 */

// ---------------------------------------------------------------------------------------------
// Mã thao tác + nhãn. Thêm thao tác mới: thêm vào đây trước, nếu không `logAudit` báo lỗi biên dịch.

export const AUDIT_ACTION_LABELS = {
  USER_CREATED: "Tạo người dùng",
  USER_UPDATED: "Sửa thông tin người dùng",
  USER_ROLE_CHANGED: "Đổi vai trò",
  USER_TRANSFERRED: "Chuyển công ty",
  USER_LOCKED: "Khoá tài khoản",
  USER_UNLOCKED: "Mở khoá tài khoản",
  USER_PASSWORD_RESET: "Đặt lại mật khẩu",
  USER_PASSWORD_CHANGED: "Đổi mật khẩu",
  USERS_IMPORTED: "Import nhân viên từ Excel",
  COMPANY_CREATED: "Tạo công ty con",
  COMPANY_UPDATED: "Sửa công ty",
  COMPANY_SUSPENDED: "Tạm ngưng công ty",
  COMPANY_ACTIVATED: "Kích hoạt lại công ty",
  COMPANY_ADMIN_CREATED: "Tạo admin công ty",
  DEPARTMENT_CREATED: "Tạo phòng ban",
  DEPARTMENT_UPDATED: "Sửa phòng ban",
  DEPARTMENT_TOGGLED: "Ẩn / hiện phòng ban",
  DEPARTMENT_MANAGER_ASSIGNED: "Chỉ định trưởng phòng",
  POSITION_CREATED: "Tạo chức danh",
  POSITION_UPDATED: "Sửa chức danh",
  POSITION_TOGGLED: "Ẩn / hiện chức danh",
  CATEGORY_CREATED: "Tạo danh mục khoá học",
  CATEGORY_UPDATED: "Sửa danh mục khoá học",
  CATEGORY_TOGGLED: "Ẩn / hiện danh mục khoá học",
  COURSE_CREATED: "Tạo khoá học",
  COURSE_UPDATED: "Sửa thông tin khoá học",
  COURSE_ARCHIVED: "Lưu trữ khoá học",
  COURSE_RESTORED: "Khôi phục khoá học",
  COURSE_PUBLISHED: "Phát hành khoá học",
  COURSE_VERSION_PUBLISHED: "Phát hành bản cập nhật khoá học",
  COURSE_VERSION_PROPOSED: "Đề xuất bản cập nhật MAJOR",
  COURSE_VERSION_REJECTED: "Từ chối đề xuất MAJOR",
  COURSE_CONTENT_REORDERED: "Sắp xếp nội dung khoá học",
  SECTION_CREATED: "Thêm chương",
  SECTION_UPDATED: "Đổi tên chương",
  SECTION_DELETED: "Xoá chương",
  SECTION_ARCHIVED: "Ẩn chương",
  SECTION_RESTORED: "Hiện lại chương",
  LESSON_CREATED: "Thêm bài học",
  LESSON_UPDATED: "Sửa bài học",
  LESSON_DELETED: "Xoá bài học",
  LESSON_ARCHIVED: "Ẩn bài học",
  LESSON_RESTORED: "Hiện lại bài học",
  LESSON_VIDEO_SET: "Gắn video cho bài",
  LESSON_VIDEO_REMOVED: "Gỡ video khỏi bài",
  LESSON_VIDEO_UPLOAD_STARTED: "Bắt đầu tải video lên Bunny",
  ENROLLMENTS_ASSIGNED: "Giao khoá học",
  ENROLLMENT_EXTENDED: "Gia hạn lượt giao",
  ENROLLMENT_CANCELLED: "Huỷ lượt giao",
  ASSIGNMENT_RULE_CREATED: "Tạo quy tắc giao tự động",
  ASSIGNMENT_RULE_UPDATED: "Sửa quy tắc giao tự động",
  ASSIGNMENT_RULE_DISABLED: "Tắt quy tắc giao tự động",
  ASSIGNMENT_RULE_ENABLED: "Bật quy tắc giao tự động",
  QUESTION_CREATED: "Thêm câu hỏi",
  QUESTION_UPDATED: "Sửa câu hỏi",
  QUESTION_TOGGLED: "Tắt / bật câu hỏi",
  QUESTION_DELETED: "Xoá câu hỏi",
  QUESTIONS_IMPORTED: "Import câu hỏi từ Excel",
  QUIZ_ATTEMPTS_GRANTED: "Cấp thêm lượt làm bài kiểm tra",
  JOB_DAILY_RUN: "Chạy tác vụ hằng ngày",
  CERTIFICATE_REVOKED: "Thu hồi chứng nhận",
  CERTIFICATE_TEMPLATE_UPDATED: "Sửa mẫu chứng nhận",
  PATH_CREATED: "Tạo lộ trình học",
  PATH_UPDATED: "Sửa lộ trình học",
  PATH_PUBLISHED: "Phát hành lộ trình học",
  PATH_ARCHIVED: "Lưu trữ lộ trình học",
  PATH_RESTORED: "Khôi phục lộ trình học",
  PATH_COURSE_APPENDED: "Thêm khoá vào cuối lộ trình",
  TEAM_REMINDER_SENT: "Nhắc nhở nhân viên",
  REPORT_EXPORTED: "Xuất báo cáo",
  SETTINGS_UPDATED: "Sửa cài đặt hệ thống",
  BUNNY_CONNECTION_TESTED: "Kiểm tra kết nối Bunny Stream",
  LARK_SYNC_RUN: "Đồng bộ Lark",
  LARK_MAPPING_UPDATED: "Ghép công ty với phòng ban Lark",
  LARK_CREDENTIALS_UPDATED: "Cấu hình kết nối Lark",
  BUNNY_CREDENTIALS_UPDATED: "Cấu hình Bunny Stream",
} as const;

export type AuditAction = keyof typeof AUDIT_ACTION_LABELS;

export const ENTITY_LABELS = {
  User: "Người dùng",
  Company: "Công ty",
  Department: "Phòng ban",
  Position: "Chức danh",
  CourseCategory: "Danh mục khoá học",
  Course: "Khoá học",
  CourseSection: "Chương",
  Lesson: "Bài học",
  Enrollment: "Lượt giao khoá",
  AssignmentRule: "Quy tắc giao tự động",
  Question: "Câu hỏi",
  System: "Hệ thống",
  Certificate: "Chứng nhận",
  LearningPath: "Lộ trình học",
  Report: "Báo cáo",
} as const;

export type AuditEntityType = keyof typeof ENTITY_LABELS;

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType as AuditEntityType] ?? entityType;
}

// ---------------------------------------------------------------------------------------------
// Ghi nhật ký

type AuditDb = { auditLog: Prisma.TransactionClient["auditLog"] };

export type AuditEntry = {
  /** null = hệ thống tự làm (quy tắc giao, tác vụ hằng ngày...) */
  actorId: string | null;
  /** Công ty của đối tượng — để Admin công ty lọc theo phạm vi */
  companyId: string | null;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId?: string | null;
  metadata?: Prisma.InputJsonObject;
};

// Lưới an toàn: không bao giờ ghi mật khẩu / mã băm vào nhật ký (passwordMode vẫn được giữ)
const SECRET_KEY = /^(password|passwordhash|hash|.*password|.*passwordhash)$/i;

function stripSecrets(value: Prisma.InputJsonValue | null, path: string[], removed: string[]): Prisma.InputJsonValue | null {
  if (Array.isArray(value)) return value.map((v) => stripSecrets(v as Prisma.InputJsonValue, path, removed));
  if (value && typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, v] of Object.entries(value)) {
      if (SECRET_KEY.test(key)) {
        removed.push([...path, key].join("."));
        continue;
      }
      out[key] = stripSecrets(v as Prisma.InputJsonValue | null, [...path, key], removed);
    }
    return out as Prisma.InputJsonObject;
  }
  return value;
}

/**
 * Ghi 1 dòng nhật ký. `db` là transaction client (`tx`) hoặc `prisma`.
 * Trả về PrismaPromise nên dùng được cả `await logAudit(tx, …)` trong `$transaction(async tx => …)`
 * lẫn `prisma.$transaction([…, logAudit(prisma, …)])`.
 */
export function logAudit(db: AuditDb, entry: AuditEntry) {
  let metadata: Prisma.InputJsonObject | undefined;
  if (entry.metadata) {
    const removed: string[] = [];
    metadata = stripSecrets(entry.metadata, [], removed) as Prisma.InputJsonObject;
    if (removed.length > 0) console.warn(`[audit] Đã bỏ khoá nhạy cảm khỏi ${entry.action}:`, removed.join(", "));
  }
  return db.auditLog.create({
    data: {
      actorId: entry.actorId,
      companyId: entry.companyId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      ...(metadata && { metadata }),
    },
  });
}

// ---------------------------------------------------------------------------------------------
// Nhóm thao tác (màu badge + bộ lọc)

export type AuditGroup = "create" | "update" | "lock" | "password";

export const AUDIT_GROUP_LABELS: Record<AuditGroup, string> = {
  create: "Tạo mới",
  update: "Cập nhật",
  lock: "Khoá / ẩn / xoá",
  password: "Mật khẩu",
};

const GROUP_ACTIONS: Record<AuditGroup, AuditAction[]> = {
  create: [
    "USER_CREATED",
    "USERS_IMPORTED",
    "COMPANY_CREATED",
    "COMPANY_ADMIN_CREATED",
    "DEPARTMENT_CREATED",
    "POSITION_CREATED",
    "CATEGORY_CREATED",
    "COURSE_CREATED",
    "SECTION_CREATED",
    "LESSON_CREATED",
    "ENROLLMENTS_ASSIGNED",
    "ASSIGNMENT_RULE_CREATED",
    "QUESTION_CREATED",
    "QUESTIONS_IMPORTED",
    "PATH_CREATED",
    "TEAM_REMINDER_SENT",
  ],
  update: [
    "SETTINGS_UPDATED",
    "BUNNY_CONNECTION_TESTED",
    "LARK_SYNC_RUN",
    "LARK_MAPPING_UPDATED",
    "LARK_CREDENTIALS_UPDATED",
    "BUNNY_CREDENTIALS_UPDATED",
    "LESSON_VIDEO_UPLOAD_STARTED",
    "USER_UPDATED",
    "USER_ROLE_CHANGED",
    "USER_TRANSFERRED",
    "USER_UNLOCKED",
    "COMPANY_UPDATED",
    "COMPANY_ACTIVATED",
    "DEPARTMENT_UPDATED",
    "DEPARTMENT_MANAGER_ASSIGNED",
    "POSITION_UPDATED",
    "CATEGORY_UPDATED",
    "COURSE_UPDATED",
    "COURSE_RESTORED",
    "COURSE_PUBLISHED",
    "COURSE_VERSION_PUBLISHED",
    "COURSE_VERSION_PROPOSED",
    "COURSE_VERSION_REJECTED",
    "COURSE_CONTENT_REORDERED",
    "SECTION_UPDATED",
    "SECTION_RESTORED",
    "LESSON_UPDATED",
    "LESSON_RESTORED",
    "LESSON_VIDEO_SET",
    "ENROLLMENT_EXTENDED",
    "ASSIGNMENT_RULE_UPDATED",
    "ASSIGNMENT_RULE_ENABLED",
    "QUESTION_UPDATED",
    "QUIZ_ATTEMPTS_GRANTED",
    "JOB_DAILY_RUN",
    "CERTIFICATE_TEMPLATE_UPDATED",
    "PATH_UPDATED",
    "PATH_PUBLISHED",
    "PATH_RESTORED",
    "PATH_COURSE_APPENDED",
  ],
  lock: [
    "USER_LOCKED",
    "COMPANY_SUSPENDED",
    "COURSE_ARCHIVED",
    "SECTION_ARCHIVED",
    "SECTION_DELETED",
    "LESSON_ARCHIVED",
    "LESSON_DELETED",
    "LESSON_VIDEO_REMOVED",
    "ENROLLMENT_CANCELLED",
    "ASSIGNMENT_RULE_DISABLED",
    "QUESTION_DELETED",
    "CERTIFICATE_REVOKED",
    "PATH_ARCHIVED",
  ],
  password: ["USER_PASSWORD_RESET", "USER_PASSWORD_CHANGED"],
};

/** Ẩn / hiện: nhóm tuỳ metadata.isActive (false = ẩn -> lock, true = hiện lại -> update). */
const TOGGLE_ACTIONS: AuditAction[] = ["DEPARTMENT_TOGGLED", "POSITION_TOGGLED", "CATEGORY_TOGGLED", "QUESTION_TOGGLED"];

type Meta = Record<string, unknown>;

function asMeta(value: unknown): Meta {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Meta) : {};
}

export function auditActionGroup(action: string, metadata: unknown): AuditGroup {
  if ((TOGGLE_ACTIONS as string[]).includes(action)) return asMeta(metadata).isActive === false ? "lock" : "update";
  for (const group of Object.keys(GROUP_ACTIONS) as AuditGroup[]) {
    if ((GROUP_ACTIONS[group] as string[]).includes(action)) return group;
  }
  return "update";
}

/** Điều kiện Prisma cho bộ lọc nhóm thao tác. */
export function auditGroupWhere(group: AuditGroup): Prisma.AuditLogWhereInput {
  const byAction: Prisma.AuditLogWhereInput = { action: { in: GROUP_ACTIONS[group] } };
  if (group === "lock" || group === "update") {
    return {
      OR: [
        byAction,
        { action: { in: TOGGLE_ACTIONS }, metadata: { path: ["isActive"], equals: group === "update" } },
      ],
    };
  }
  return byAction;
}

/** Nhãn thao tác (có xét metadata: ẩn / hiện lại, mở khoá tạm). Mã lạ -> hiện nguyên mã. */
export function auditActionLabel(action: string, metadata?: unknown): string {
  const m = asMeta(metadata);
  if (action === "DEPARTMENT_TOGGLED") return m.isActive === false ? "Ẩn phòng ban" : "Hiện lại phòng ban";
  if (action === "POSITION_TOGGLED") return m.isActive === false ? "Ẩn chức danh" : "Hiện lại chức danh";
  if (action === "CATEGORY_TOGGLED") return m.isActive === false ? "Ẩn danh mục khoá học" : "Hiện lại danh mục khoá học";
  if (action === "QUESTION_TOGGLED") return m.isActive === false ? "Tắt câu hỏi" : "Bật lại câu hỏi";
  if (action === "CATEGORY_UPDATED" && (m.reorder === "up" || m.reorder === "down")) return "Đổi thứ tự danh mục";
  if (action === "USER_UNLOCKED" && m.kind === "LOGIN_LOCK") return "Mở khoá tạm";
  return AUDIT_ACTION_LABELS[action as AuditAction] ?? action;
}

// ---------------------------------------------------------------------------------------------
// Trình bày metadata

export const FIELD_LABELS: Record<string, string> = {
  // Cài đặt hệ thống (Việc 28A): khoá cài đặt -> nhãn
  ...Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTING_META[k].label])),
  groupTitle: "Nhóm cài đặt",
  changed: "Số mục thay đổi",
  reset: "Khôi phục mặc định",
  employeeCode: "Mã nhân viên",
  fullName: "Họ tên",
  email: "Email",
  phone: "Điện thoại",
  hireDate: "Ngày vào làm",
  department: "Phòng ban",
  departmentCode: "Phòng ban",
  position: "Chức danh",
  positionCode: "Chức danh",
  role: "Vai trò",
  companyCode: "Công ty",
  code: "Mã",
  name: "Tên",
  parentId: "Phòng cha",
  managerId: "Trưởng phòng",
  previousManagerId: "Trưởng phòng trước",
  isActive: "Đang dùng",
  activeUsers: "Số nhân viên đang làm",
  fromCompany: "Từ công ty",
  toCompany: "Sang công ty",
  fromCompanyId: "Công ty cũ",
  removedManagerOf: "Gỡ khỏi trưởng phòng",
  managerOf: "Đang là trưởng phòng",
  kind: "Loại",
  passwordMode: "Mật khẩu ban đầu",
  fileName: "Tên file",
  created: "Số tạo mới",
  updated: "Số cập nhật",
  createdCodes: "Mã NV tạo mới",
  updatedCodes: "Mã NV cập nhật",
  stoppedWithError: "Dừng do lỗi",
  roleChange: "Đổi vai trò",
  sortOrder: "Thứ tự",
  title: "Tên khoá học",
  description: "Mô tả",
  categoryId: "Danh mục",
  thumbnail: "Ảnh bìa",
  allowSelfEnroll: "Cho tự đăng ký",
  hasCertificate: "Cấp chứng nhận",
  certificateValidMonths: "Thời hạn chứng nhận (tháng)",
  status: "Trạng thái",
  courseCode: "Khoá học",
  courseId: "Khoá học",
  sectionTitle: "Chương",
  lessonTitle: "Bài học",
  lessonType: "Loại bài",
  lessonCount: "Số bài",
  changedFields: "Trường thay đổi",
  content: "Nội dung",
  file: "File PDF",
  minWatchPercent: "% xem tối thiểu",
  questionTopic: "Chủ đề câu hỏi",
  questionCount: "Số câu",
  passingScore: "Điểm đạt",
  timeLimitMinutes: "Thời gian (phút)",
  maxAttempts: "Số lần làm tối đa",
  showAnswers: "Cho xem đáp án",
  sections: "Số chương",
  movedLessons: "Bài đổi chỗ",
  crossSectionMoves: "Bài chuyển chương",
  fromSection: "Từ chương",
  toSection: "Sang chương",
  courseTitle: "Tên khoá học",
  source: "Cách giao",
  dueDate: "Hạn hoàn thành",
  ruleId: "Quy tắc",
  ruleName: "Quy tắc",
  shortened: "Rút ngắn hạn",
  unchanged: "Giữ nguyên",
  completed: "Đã hoàn thành (bỏ qua)",
  reactivated: "Kích hoạt lại",
  learnerName: "Học viên",
  dueInDays: "Hạn (ngày)",
  targetCompanyId: "Công ty áp dụng",
  includeSubDepartments: "Gồm phòng con",
  target: "Nhóm áp dụng",
  cancelMode: "Xử lý lượt đã giao",
  cancelledCount: "Số lượt bị huỷ",
  provider: "Nguồn video",
  videoId: "Mã video",
  durationSeconds: "Thời lượng (giây)",
  previousProvider: "Nguồn video trước",
  previousVideoId: "Mã video trước",
  reorder: "Di chuyển",
  from: "Trước",
  to: "Sau",
  topic: "Chủ đề",
  contentPreview: "Nội dung (rút gọn)",
  affected: "Số người bị ảnh hưởng",
  inProgress: "Số người đang học (giữ tiến độ)",
  affectedEnrollmentIds: "Lượt học bị ảnh hưởng",
  reason: "Lý do",
  changeType: "Loại cập nhật",
  versionNo: "Phiên bản",
  versionId: "Mã phiên bản",
  fromProposal: "Từ đề xuất",
  logoUrl: "Logo",
  learningPathId: "Lộ trình",
  pathCode: "Mã lộ trình",
  courseCount: "Số khoá",
  assigned: "Số người được giao thêm",
  change: "Thay đổi",
  certificateSignerName: "Tên người ký",
  certificateSignerTitle: "Chức vụ người ký",
  certificateSignatureUrl: "Ảnh chữ ký",
  count: "Số câu",
  type: "Loại câu hỏi",
  optionCount: "Số phương án",
  hasImage: "Có ảnh",
  users: "Số người",
  notifications: "Số thông báo",
  skipped: "Bỏ qua (đã nhắc hôm nay)",
  mode: "Kiểu nhắc",
  note: "Lời nhắn",
  tab: "Báo cáo",
  tabLabel: "Báo cáo",
  rows: "Số dòng",
  filters: "Bộ lọc",
};

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

const VALUE_LABELS: Record<string, Record<string, string>> = {
  kind: { ACCOUNT: "Khoá tài khoản", LOGIN_LOCK: "Khoá tạm do sai mật khẩu" },
  passwordMode: { manual: "Admin tự nhập", generated: "Hệ thống tự sinh" },
  reorder: { up: "Lên trên", down: "Xuống dưới" },
  status: { DRAFT: "Nháp", PUBLISHED: "Đã phát hành", ARCHIVED: "Lưu trữ", PROCESSING: "Đang xử lý", READY: "Sẵn sàng", FAILED: "Lỗi xử lý" },
  from: { DRAFT: "Nháp", PUBLISHED: "Đã phát hành", ARCHIVED: "Lưu trữ" },
  to: { DRAFT: "Nháp", PUBLISHED: "Đã phát hành", ARCHIVED: "Lưu trữ" },
  lessonType: { VIDEO: "Video", DOCUMENT: "Tài liệu", QUIZ: "Bài kiểm tra" },
  provider: { YOUTUBE: "YouTube", BUNNY: "Bunny Stream" },
  source: { RULE: "Tự động", ASSIGNED: "Thủ công", SELF: "Tự đăng ký" },
  cancelMode: { keep: "Giữ các lượt đã giao", cancelNotStarted: "Huỷ các lượt chưa bắt đầu" },
  previousProvider: { YOUTUBE: "YouTube", BUNNY: "Bunny Stream" },
  content: { changed: "Đã đổi nội dung" },
  thumbnail: { has: "Có ảnh", added: "Đã thêm ảnh", replaced: "Đã thay ảnh", removed: "Đã xoá ảnh", none: "Không có" },
};

/**
 * Giá trị metadata -> chữ dễ đọc. `resolved`: id -> “Tên (mã)” (server tra sẵn cho các khoá *Id).
 */
export function formatAuditValue(key: string, value: unknown, resolved: Record<string, string> = {}): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "string") {
    if (resolved[value]) return resolved[value];
    if (VALUE_LABELS[key]?.[value]) return VALUE_LABELS[key][value];
    if (value in ROLE_LABELS) return ROLE_LABELS[value as Role];
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-");
      return `${d}/${m}/${y}`;
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((v) => formatAuditValue(key, v, resolved)).join(", ");
  }
  const obj = asMeta(value);
  return Object.entries(obj)
    .map(([k, v]) => `${fieldLabel(k)}: ${formatAuditValue(k, v, resolved)}`)
    .join("; ");
}

export type BeforeAfterRow = { key: string; label: string; before: unknown; after: unknown };

/**
 * Dữ liệu “Trước → Sau” nếu metadata có: `{ before, after }`, `{ from, to }` (đổi vai trò) hoặc `roleChange`.
 * Trả null nếu không có.
 */
export function getBeforeAfter(action: string, metadata: unknown): BeforeAfterRow[] | null {
  const m = asMeta(metadata);
  const rows: BeforeAfterRow[] = [];

  if (m.before !== undefined || m.after !== undefined) {
    const before = asMeta(m.before);
    const after = asMeta(m.after);
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      rows.push({ key, label: fieldLabel(key), before: before[key], after: after[key] });
    }
  }
  if (m.from !== undefined || m.to !== undefined) {
    const key = action === "USER_ROLE_CHANGED" ? "role" : action.startsWith("COURSE_") ? "status" : "value";
    const label = key === "role" ? "Vai trò" : key === "status" ? "Trạng thái" : "Giá trị";
    rows.push({ key, label, before: m.from, after: m.to });
  }
  const roleChange = asMeta(m.roleChange);
  if (roleChange.from !== undefined || roleChange.to !== undefined) {
    rows.push({ key: "role", label: "Vai trò (tự nâng)", before: roleChange.from, after: roleChange.to });
  }
  if (action === "USER_TRANSFERRED" && (m.fromCompany || m.toCompany)) {
    rows.push({ key: "company", label: "Công ty", before: m.fromCompany, after: m.toCompany });
  }
  return rows.length > 0 ? rows : null;
}

/** Các khoá metadata không nằm trong phần Trước → Sau (để liệt kê ở mục “Chi tiết”). */
export function otherMetadataEntries(action: string, metadata: unknown): [string, unknown][] {
  const hidden = new Set(["before", "after", "from", "to", "roleChange"]);
  if (action === "USER_TRANSFERRED") {
    hidden.add("fromCompany");
    hidden.add("toCompany");
  }
  return Object.entries(asMeta(metadata)).filter(([k]) => !hidden.has(k));
}

function roleLabel(value: unknown): string {
  return typeof value === "string" && value in ROLE_LABELS ? ROLE_LABELS[value as Role] : String(value ?? "—");
}

function codes(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Mô tả ngắn 1 dòng nhật ký từ metadata (null = không có gì thêm để nói). */
export function describeAuditEntry(action: string, metadata: unknown): string | null {
  const m = asMeta(metadata);

  switch (action) {
    case "USER_CREATED":
      return [
        m.role ? `Vai trò ${roleLabel(m.role)}` : null,
        m.companyCode ? `công ty ${m.companyCode}` : null,
        m.departmentCode ? `phòng ${m.departmentCode}` : null,
      ]
        .filter(Boolean)
        .join(", ");
    case "USER_UPDATED":
    case "COMPANY_UPDATED":
    case "DEPARTMENT_UPDATED":
    case "POSITION_UPDATED": {
      const before = asMeta(m.before);
      const after = asMeta(m.after);
      const changed = Object.keys(after)
        .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
        .map((k) => fieldLabel(k).toLowerCase());
      return changed.length > 0 ? `Đổi ${changed.join(", ")}` : null;
    }
    case "USER_ROLE_CHANGED":
      return `${roleLabel(m.from)} → ${roleLabel(m.to)}`;
    case "USER_TRANSFERRED": {
      const removed = codes(m.removedManagerOf);
      return `${m.fromCompany ?? "?"} → ${m.toCompany ?? "?"}${
        removed.length > 0 ? ` · gỡ trưởng phòng: ${removed.join(", ")}` : ""
      }`;
    }
    case "USER_LOCKED": {
      const managerOf = codes(m.managerOf);
      return managerOf.length > 0 ? `Đang là trưởng phòng: ${managerOf.join(", ")}` : null;
    }
    case "LESSON_VIDEO_SET": {
      const provider = m.provider === "BUNNY" ? "Bunny Stream" : m.provider === "YOUTUBE" ? "YouTube" : null;
      const secs = typeof m.durationSeconds === "number" ? m.durationSeconds : null;
      const dur = secs ? ` · ${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : m.status === "PROCESSING" ? " · đang xử lý" : "";
      return provider ? `${m.lessonTitle ?? "Bài"} — ${provider}${dur}` : null;
    }
    case "ENROLLMENTS_ASSIGNED": {
      const parts = [
        m.created ? `giao mới ${m.created}` : null,
        m.reactivated ? `kích hoạt lại ${m.reactivated}` : null,
        m.shortened ? `rút ngắn hạn ${m.shortened}` : null,
      ].filter(Boolean);
      const how = m.source === "RULE" ? "tự động" : m.source === "SELF" ? "tự đăng ký" : "thủ công";
      return `${m.courseCode ?? ""} (${how}): ${parts.join(", ") || "không thay đổi"}`;
    }
    case "ENROLLMENT_EXTENDED":
      return `${m.learnerName ?? ""} — ${m.courseCode ?? ""}`;
    case "ASSIGNMENT_RULE_DISABLED":
      return m.cancelMode === "cancelNotStarted" ? `Huỷ ${m.cancelledCount ?? 0} lượt chưa bắt đầu` : "Giữ các lượt đã giao";
    case "USERS_IMPORTED":
      return `Công ty ${m.companyCode ?? "?"}: tạo mới ${m.created ?? 0}, cập nhật ${m.updated ?? 0}${
        m.fileName ? ` (file ${m.fileName})` : ""
      }`;
    case "QUESTION_CREATED":
    case "QUESTION_UPDATED":
    case "QUESTION_TOGGLED":
    case "QUESTION_DELETED":
      return (
        [
          m.courseCode ? `Khoá ${m.courseCode}` : null,
          m.topic ? `chủ đề ${m.topic}` : null,
          m.contentPreview ? `“${m.contentPreview}”` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null
      );
    case "PATH_CREATED":
    case "PATH_PUBLISHED":
    case "PATH_ARCHIVED":
    case "PATH_RESTORED":
      return `${m.code ?? ""}${m.title ? ` — ${m.title}` : ""}${typeof m.courseCount === "number" ? ` · ${m.courseCount} khoá` : ""}`;
    case "PATH_UPDATED":
      return `${m.code ?? ""}${m.change ? ` — ${m.change}` : ""}`;
    case "PATH_COURSE_APPENDED":
      return `${m.code ?? ""} — thêm khoá ${m.courseCode ?? "?"} vào cuối, giao thêm cho ${m.assigned ?? 0} người`;
    case "TEAM_REMINDER_SENT":
      return `${m.mode === "all" ? "Mọi khoá chưa xong" : m.mode === "ack" ? `Xác nhận cập nhật ${m.courseCode ?? ""}` : "Khoá quá hạn"} — ${m.users ?? 0} người, ${m.notifications ?? 0} thông báo${m.skipped ? ` (bỏ qua ${m.skipped} đã nhắc hôm nay)` : ""}`;
    case "SETTINGS_UPDATED":
      return `${m.groupTitle ?? ""}${typeof m.changed === "number" ? ` — đổi ${m.changed} mục` : ""}${m.reset ? " (khôi phục mặc định)" : ""}`;
    case "REPORT_EXPORTED":
      return `${m.tabLabel ?? m.tab ?? ""} — ${m.rows ?? 0} dòng${m.filters ? ` · ${m.filters}` : ""}`;
    case "CERTIFICATE_REVOKED":
      return `${m.code ?? ""} — ${m.learnerName ?? ""}${m.reason ? ` · lý do: ${m.reason}` : ""}`;
    case "CERTIFICATE_TEMPLATE_UPDATED": {
      const changed = Array.isArray(m.changedFields) ? m.changedFields.map((k) => fieldLabel(String(k)).toLowerCase()) : [];
      return `${m.companyCode ?? ""}${changed.length ? ` — đổi ${changed.join(", ")}` : ""}`;
    }
    case "COURSE_VERSION_PUBLISHED":
      return `${m.code ?? ""} — v${m.versionNo ?? "?"} ${m.changeType ?? ""}: ${m.affected ?? 0} người ${m.changeType === "MAJOR" ? "phải học lại" : "cần xác nhận"}${m.fromProposal ? " (duyệt đề xuất)" : ""}`;
    case "COURSE_VERSION_PROPOSED":
      return `${m.code ?? ""} — đề xuất MAJOR, hạn học lại ${m.dueInDays ?? "?"} ngày`;
    case "COURSE_VERSION_REJECTED":
      return `${m.code ?? ""} — lý do: ${m.reason ?? ""}`;
    case "COURSE_PUBLISHED":
      return `${m.code ?? ""} — phiên bản ${m.versionNo ?? "?"}${m.changeType === "INITIAL" ? " (lần đầu)" : ""}`;
    case "JOB_DAILY_RUN": {
      const c = asMeta(m.counts);
      const errors = Object.keys(asMeta(m.errors)).length;
      return [
        c.larkSync ? `Lark ${c.larkSync}` : null,
        `sắp hạn ${c.dueSoon ?? 0}`,
        `quá hạn ${c.overdue ?? 0}`,
        `chấm bài ${c.quizGraded ?? 0}`,
        `CN sắp hết hạn ${c.certExpiring ?? 0}`,
        `học lại ${c.certExpiredReset ?? 0}`,
        `xoá TB ${c.notificationsDeleted ?? 0}`,
        `nhắc xác nhận ${c.ackOverdue ?? 0}`,
        c.bunnyStatusSynced ? `cập nhật video ${c.bunnyStatusSynced}` : null,
        c.bunnyPendingCleaned ? `dọn video tải dở ${c.bunnyPendingCleaned}` : null,
        errors > 0 ? `${errors} phần lỗi` : null,
      ]
        .filter(Boolean)
        .join(" · ");
    }
    case "LARK_SYNC_RUN": {
      const c = asMeta(m.counts);
      const how = m.trigger === "manual" ? "Chạy tay" : m.trigger === "script" ? "Script" : "Tự động";
      if (m.applied !== true) return `${how} — không áp dụng: ${m.error ?? "?"}`;
      return `${how} — tạo ${c.create ?? 0} · cập nhật ${c.update ?? 0} · chuyển công ty ${c.transfer ?? 0} · khoá ${c.lock ?? 0} · mở lại ${c.reopen ?? 0} · phòng ban ${c.departments ?? 0} · bỏ qua ${c.skipped ?? 0}`;
    }
    case "LARK_CREDENTIALS_UPDATED":
      return m.cleared ? "Xoá cấu hình trên giao diện" : `App ID ${m.appId ?? "?"} · ${m.domain === "feishu" ? "Feishu" : "Lark quốc tế"}${m.secretChanged ? " · đổi App Secret" : ""}`;
    case "BUNNY_CREDENTIALS_UPDATED": {
      if (m.cleared) return "Xoá cấu hình trên giao diện";
      const changed = [m.apiKeyChanged && "API key", m.tokenKeyChanged && "Token key", m.readonlyKeyChanged && "Read-Only key"].filter(Boolean);
      return `Library ID ${m.libraryId ?? "?"}${changed.length ? ` · đổi ${changed.join(", ")}` : ""}${m.readonlyKeyRemoved ? " · gỡ Read-Only key" : ""}`;
    }
    case "LARK_MAPPING_UPDATED":
      return `${m.companyCode ?? "?"}: ${m.fromName ?? "chưa ghép"} → ${m.toName ?? "bỏ ghép"}`;
    case "BUNNY_CONNECTION_TESTED":
      return (
        {
          ok: `Đã kết nối${typeof m.videoCount === "number" ? ` · ${m.videoCount} video` : ""}`,
          not_configured: "Chưa cấu hình",
          bad_key: "Lỗi: sai API key",
          bad_library: "Lỗi: sai Library ID",
          unreachable: "Lỗi: không gọi được Bunny",
        } as Record<string, string>
      )[String(m.result)] ?? null;
    case "LESSON_VIDEO_UPLOAD_STARTED":
      return `${m.lessonTitle ?? "Bài"}${m.fileName ? ` — file ${m.fileName}` : ""}`;
    case "QUIZ_ATTEMPTS_GRANTED":
      return `${m.learnerName ?? ""} — ${m.courseCode ?? ""} · bài “${m.lessonTitle ?? "?"}”: +${m.count ?? 0} lượt`;
    case "QUESTIONS_IMPORTED":
      return `Khoá ${m.courseCode ?? "?"}: thêm ${m.count ?? 0} câu${m.fileName ? ` (file ${m.fileName})` : ""}`;
    case "USER_UNLOCKED":
      return m.kind === "LOGIN_LOCK" ? "Gỡ khoá tạm do sai mật khẩu" : null;
    case "COMPANY_SUSPENDED":
      return typeof m.activeUsers === "number" ? `${m.activeUsers} nhân viên đang làm bị chặn đăng nhập` : null;
    case "COMPANY_ADMIN_CREATED":
      return m.employeeCode ? `Tài khoản ${m.employeeCode}${m.fullName ? ` — ${m.fullName}` : ""}` : null;
    case "DEPARTMENT_MANAGER_ASSIGNED": {
      const change = asMeta(m.roleChange);
      return [
        m.departmentCode ? `Phòng ${m.departmentCode}` : null,
        m.employeeCode ? `trưởng phòng ${m.employeeCode}` : null,
        change.to ? `tự nâng vai trò ${roleLabel(change.from)} → ${roleLabel(change.to)}` : null,
      ]
        .filter(Boolean)
        .join(", ");
    }
    default:
      return null;
  }
}
