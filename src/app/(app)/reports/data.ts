import type { Workbook } from "@/lib/excel";
import { addSimpleSheet, type SimpleColumn } from "@/lib/excel";
import { ENROLLMENT_STATUS_LABELS } from "@/lib/enrollment-labels";
import { normalizeSearch } from "@/lib/tree";
import { METRICS, type MetricKey } from "@/lib/report-definitions";
import {
  CERT_WINDOWS,
  certificateReport,
  courseLearners,
  courseReport,
  departmentReport,
  memberReport,
  REPORT_TAB_LABELS,
  REPORT_TABS,
  sortRows,
  versionReport,
  type CertificateReportRow,
  type CertWindow,
  type CourseReportRow,
  type DepartmentReportRow,
  type LearnerRow,
  type MemberReportRow,
  type ReportContext,
  type ReportTab,
  type VersionReportRow,
} from "@/lib/reports";
import { getParam, type SearchParams } from "@/lib/table-params";

/**
 * Trạng thái tab báo cáo (tab, tìm, sắp xếp, chi tiết) + dữ liệu đã lọc / sắp xếp — dùng chung cho trang /reports và route xuất Excel.
 */

export type TabState = {
  tab: ReportTab;
  q: string;
  sort: string | null;
  dir: "asc" | "desc";
  /** Phòng ban: cộng dồn phòng con */
  cumulative: boolean;
  window: CertWindow;
  /** Chi tiết khoá (tab courses / versions) */
  course: string | null;
};

export function parseTabState(sp: SearchParams): TabState {
  const tab = getParam(sp, "tab");
  const window = getParam(sp, "window");
  const course = getParam(sp, "course");
  const sort = getParam(sp, "sort");
  return {
    tab: (REPORT_TABS as readonly string[]).includes(tab) ? (tab as ReportTab) : "courses",
    q: getParam(sp, "q").trim().slice(0, 100),
    sort: /^[a-zA-Z]{1,40}$/.test(sort) ? sort : null,
    dir: getParam(sp, "dir") === "asc" ? "asc" : "desc",
    cumulative: getParam(sp, "cumulative") === "1",
    window: (CERT_WINDOWS as readonly string[]).includes(window) ? (window as CertWindow) : "30",
    course: course && course.length <= 50 ? course : null,
  };
}

const matches = (q: string, ...values: (string | null | undefined)[]) => {
  if (!q) return true;
  const needle = normalizeSearch(q);
  return values.some((v) => v && normalizeSearch(v).includes(needle));
};

export type TabData =
  | { kind: "courses"; rows: CourseReportRow[] }
  | { kind: "courseLearners"; course: { id: string; code: string; title: string; currentVersion: number }; rows: LearnerRow[] }
  | { kind: "departments"; rows: DepartmentReportRow[] }
  | { kind: "members"; rows: MemberReportRow[] }
  | { kind: "versions"; rows: VersionReportRow[] }
  | { kind: "versionLearners"; course: { id: string; code: string; title: string; currentVersion: number }; rows: LearnerRow[] }
  | { kind: "certificates"; rows: CertificateReportRow[] };

/** Dữ liệu 1 tab theo bộ lọc + tìm + sắp xếp (chưa phân trang). Khoá chi tiết không hợp lệ -> trả bảng tổng của tab. */
export async function loadTab(ctx: ReportContext, state: TabState): Promise<TabData> {
  const { q, sort, dir } = state;
  switch (state.tab) {
    case "courses": {
      if (state.course) {
        const d = await courseLearners(ctx, state.course, "all");
        if (d) return { kind: "courseLearners", course: d.course, rows: sortRows(d.rows.filter((r) => matches(q, r.fullName, r.employeeCode)), sort, dir) };
      }
      const rows = (await courseReport(ctx)).filter((r) => matches(q, r.title, r.code));
      return { kind: "courses", rows: sortRows(rows, sort, dir) };
    }
    case "departments": {
      const rows = (await departmentReport(ctx, state.cumulative)).filter((r) => matches(q, r.name));
      // Không sắp xếp -> giữ dạng cây
      return { kind: "departments", rows: sortRows(rows, sort, dir) };
    }
    case "members": {
      const rows = (await memberReport(ctx)).filter((r) => matches(q, r.fullName, r.employeeCode));
      return { kind: "members", rows: sortRows(rows, sort ?? "fullName", sort ? dir : "asc") };
    }
    case "versions": {
      if (state.course) {
        const d = await courseLearners(ctx, state.course, "unacknowledged");
        if (d) return { kind: "versionLearners", course: d.course, rows: sortRows(d.rows.filter((r) => matches(q, r.fullName, r.employeeCode)), sort, dir) };
      }
      const rows = (await versionReport(ctx)).filter((r) => matches(q, r.title, r.code));
      return { kind: "versions", rows: sortRows(rows, sort, dir) };
    }
    case "certificates": {
      const rows = (await certificateReport(ctx, state.window)).filter((r) => matches(q, r.fullName, r.employeeCode, r.courseTitle, r.code));
      return { kind: "certificates", rows: sortRows(rows, sort, dir) };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Excel

const h = (key: MetricKey) => METRICS[key].label;
const statusLabel = (s: string | null) => (s ? (ENROLLMENT_STATUS_LABELS[s as keyof typeof ENROLLMENT_STATUS_LABELS]?.label ?? s) : "Chưa giao lại");

const COURSE_COLS: SimpleColumn<CourseReportRow>[] = [
  { header: "Mã khoá", width: 16, value: (r) => r.code },
  { header: "Tên khoá", width: 40, value: (r) => r.title },
  { header: "Danh mục", width: 20, value: (r) => r.categoryName ?? "" },
  { header: h("assigned"), width: 12, format: "number", value: (r) => r.assigned },
  { header: h("inProgress"), width: 12, format: "number", value: (r) => r.inProgress },
  { header: h("notStarted"), width: 14, format: "number", value: (r) => r.notStarted },
  { header: h("completed"), width: 12, format: "number", value: (r) => r.completed },
  { header: h("overdue"), width: 12, format: "number", value: (r) => r.overdue },
  { header: h("completionRate"), width: 16, format: "percent", value: (r) => r.completionRate },
  { header: h("avgScore"), width: 12, format: "number", value: (r) => r.avgScore },
  { header: h("firstPassRate"), width: 14, format: "percent", value: (r) => r.firstPassRate },
  { header: h("avgDaysToComplete"), width: 20, format: "number", value: (r) => r.avgDaysToComplete },
  { header: h("avgRating"), width: 14, format: "number", value: (r) => r.avgRating },
  { header: "Số lượt đánh giá", width: 16, format: "number", value: (r) => r.ratingCount },
];

const LEARNER_COLS: SimpleColumn<LearnerRow>[] = [
  { header: "Mã NV", width: 14, value: (r) => r.employeeCode },
  { header: "Họ tên", width: 28, value: (r) => r.fullName },
  { header: "Phòng ban", width: 26, value: (r) => r.departmentName ?? "" },
  { header: "Trạng thái", width: 16, value: (r) => (r.overdue ? "Quá hạn" : statusLabel(r.status)) },
  { header: "Tiến độ", width: 10, format: "percent", value: (r) => r.progressPercent },
  { header: "Hạn", width: 14, format: "date", value: (r) => r.dueDate },
  { header: h("bestScore"), width: 14, format: "number", value: (r) => r.bestScore },
  { header: "Ngày hoàn thành", width: 16, format: "date", value: (r) => r.completedAt },
];

const VERSION_LEARNER_COLS: SimpleColumn<LearnerRow>[] = [
  { header: "Mã NV", width: 14, value: (r) => r.employeeCode },
  { header: "Họ tên", width: 28, value: (r) => r.fullName },
  { header: "Phòng ban", width: 26, value: (r) => r.departmentName ?? "" },
  { header: "Tình trạng", width: 26, value: (r) => (r.ackState === "unconfirmed" ? "Chưa xác nhận (MINOR)" : "Đang học lại (MAJOR)") },
  { header: "Phiên bản đã nắm", width: 16, value: (r) => (r.acknowledgedVersion ? `v${r.acknowledgedVersion}` : "") },
  { header: "Tiến độ", width: 10, format: "percent", value: (r) => r.progressPercent },
  { header: "Hạn", width: 14, format: "date", value: (r) => r.dueDate },
];

const DEPT_COLS: SimpleColumn<DepartmentReportRow>[] = [
  { header: "Phòng ban", width: 36, value: (r) => `${"    ".repeat(r.depth)}${r.name}` },
  { header: "Công ty", width: 12, value: (r) => r.companyCode },
  { header: h("memberCount"), width: 10, format: "number", value: (r) => r.memberCount },
  { header: h("assigned"), width: 12, format: "number", value: (r) => r.assigned },
  { header: h("completed"), width: 12, format: "number", value: (r) => r.completed },
  { header: h("overdue"), width: 12, format: "number", value: (r) => r.overdue },
  { header: h("completionRate"), width: 16, format: "percent", value: (r) => r.completionRate },
];

const MEMBER_COLS: SimpleColumn<MemberReportRow>[] = [
  { header: "Mã NV", width: 14, value: (r) => r.employeeCode },
  { header: "Họ tên", width: 28, value: (r) => r.fullName },
  { header: "Email", width: 28, value: (r) => r.email ?? "" },
  { header: "Công ty", width: 12, value: (r) => r.companyCode },
  { header: "Phòng ban", width: 26, value: (r) => r.departmentName ?? "" },
  { header: "Chức danh", width: 22, value: (r) => r.positionName ?? "" },
  { header: h("assigned"), width: 12, format: "number", value: (r) => r.assigned },
  { header: h("completed"), width: 12, format: "number", value: (r) => r.completed },
  { header: h("overdue"), width: 12, format: "number", value: (r) => r.overdue },
  { header: h("completionRate"), width: 16, format: "percent", value: (r) => r.completionRate },
  { header: h("avgScore"), width: 12, format: "number", value: (r) => r.avgScore },
  { header: h("validCertificates"), width: 18, format: "number", value: (r) => r.validCertificates },
  { header: h("lastActivity"), width: 18, format: "datetime", value: (r) => r.lastActivity },
];

const VERSION_COLS: SimpleColumn<VersionReportRow>[] = [
  { header: "Mã khoá", width: 16, value: (r) => r.code },
  { header: "Tên khoá", width: 40, value: (r) => r.title },
  { header: h("currentVersion"), width: 16, value: (r) => `v${r.currentVersion}` },
  { header: "Ngày phát hành bản mới nhất", width: 22, format: "date", value: (r) => r.latestPublishedAt },
  { header: "Loại bản mới nhất", width: 16, value: (r) => r.latestChangeType ?? "" },
  { header: h("everCompleted"), width: 18, format: "number", value: (r) => r.everCompleted },
  { header: h("acknowledged"), width: 18, format: "number", value: (r) => r.acknowledged },
  { header: h("unconfirmed"), width: 20, format: "number", value: (r) => r.unconfirmed },
  { header: h("relearning"), width: 20, format: "number", value: (r) => r.relearning },
  { header: h("ackRate"), width: 14, format: "percent", value: (r) => r.ackRate },
];

const CERT_COLS: SimpleColumn<CertificateReportRow>[] = [
  { header: "Mã NV", width: 14, value: (r) => r.employeeCode },
  { header: "Họ tên", width: 28, value: (r) => r.fullName },
  { header: "Phòng ban", width: 26, value: (r) => r.departmentName ?? "" },
  { header: "Khoá học", width: 36, value: (r) => r.courseTitle },
  { header: "Mã chứng nhận", width: 20, value: (r) => r.code },
  { header: "Ngày cấp", width: 14, format: "date", value: (r) => r.issuedAt },
  { header: h("certExpiresAt"), width: 14, format: "date", value: (r) => r.expiresAt },
  { header: h("daysLeft"), width: 12, format: "number", value: (r) => r.daysLeft },
  { header: h("relearnStatus"), width: 18, value: (r) => statusLabel(r.relearnStatus) },
];

/** Thêm sheet cho dữ liệu 1 tab. Trả số dòng. */
export function addTabSheet(wb: Workbook, data: TabData, sheetName?: string): number {
  switch (data.kind) {
    case "courses":
      addSimpleSheet(wb, sheetName ?? REPORT_TAB_LABELS.courses, COURSE_COLS, data.rows);
      break;
    case "courseLearners":
      addSimpleSheet(wb, sheetName ?? `Khoá ${data.course.code}`.slice(0, 31), LEARNER_COLS, data.rows);
      break;
    case "departments":
      addSimpleSheet(wb, sheetName ?? REPORT_TAB_LABELS.departments, DEPT_COLS, data.rows);
      break;
    case "members":
      addSimpleSheet(wb, sheetName ?? REPORT_TAB_LABELS.members, MEMBER_COLS, data.rows);
      break;
    case "versions":
      addSimpleSheet(wb, sheetName ?? REPORT_TAB_LABELS.versions, VERSION_COLS, data.rows);
      break;
    case "versionLearners":
      addSimpleSheet(wb, sheetName ?? `Chưa nắm ${data.course.code}`.slice(0, 31), VERSION_LEARNER_COLS, data.rows);
      break;
    case "certificates":
      addSimpleSheet(wb, sheetName ?? REPORT_TAB_LABELS.certificates, CERT_COLS, data.rows);
      break;
  }
  return data.rows.length;
}
