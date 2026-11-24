/**
 * Danh sách ảnh minh hoạ cho trang Hướng dẫn sử dụng (/help) — dùng bởi scripts/help/capture.ts.
 *
 * QUY TẮC: chỉ XEM, không ghi dữ liệu — không bấm nút lưu / gửi / nộp / xác nhận. Mở dialog, chọn tab, cuộn trang là được.
 * Tài khoản là tài khoản demo (docs/demo-data.md), mật khẩu 123456789.
 */
import type { Page } from "@playwright/test";

/** Id thật tra từ database demo theo mã (capture.ts → lookupIds). */
export type HelpIds = {
  courseAT01: string;
  courseIT01: string;
  courseNQ01: string;
  courseSP01: string;
  libraryCourse: string;
  pathLTKD: string;
  userTM001: string;
  ruleId: string;
  certCode: string;
  lessonVideoAT01: string;
  lessonVideoAT01Title: string;
  lessonDocKN02: string;
  courseKN02: string;
  lessonQuizAT01: string;
  lessonQuizNQ01: string;
};

export type HelpUser = "ADMIN" | "CA-TM" | "CE-TONG" | "MG-KD" | "TM-001" | "TM-004" | null;

export type ShotSpec = {
  /** Tên file (không đuôi) — public/images/help/<name>.jpg; cũng là khoá trong shots-manifest.json */
  name: string;
  /** null = chưa đăng nhập */
  user: HelpUser;
  path: (ids: HelpIds) => string;
  mobile?: boolean;
  /** Thao tác trước khi chụp (mở dialog, chọn tab…) — KHÔNG ghi dữ liệu */
  prepare?: (page: Page, ids: HelpIds) => Promise<void>;
  /** Chụp riêng 1 phần tử thay vì cả màn hình */
  target?: string;
};

const click = async (page: Page, name: string | RegExp, role: "button" | "link" | "tab" = "button") => {
  await page.getByRole(role, { name }).first().click();
};
const waitDialog = async (page: Page) => {
  // Bỏ qua hộp báo lỗi của Next dev (cũng có role="dialog", bị ẩn khi chụp)
  await page.locator('[role="dialog"]:not([data-nextjs-dialog]), [role="alertdialog"]').filter({ visible: true }).first().waitFor({ state: "visible" });
  await page.waitForTimeout(400);
};

export const SHOTS: ShotSpec[] = [
  // ---------------- Bắt đầu ----------------
  { name: "login", user: null, path: () => "/login" },
  { name: "change-password", user: "TM-001", path: () => "/change-password" },
  { name: "layout-admin", user: "ADMIN", path: () => "/dashboard" },
  {
    name: "user-menu",
    user: "TM-001",
    path: () => "/dashboard",
    prepare: async (page) => {
      await click(page, "Tài khoản của tôi");
      await page.getByRole("menu").waitFor();
      await page.waitForTimeout(300);
    },
  },
  {
    name: "quick-search",
    user: "CA-TM",
    path: () => "/dashboard",
    prepare: async (page) => {
      await page.keyboard.press("Control+k");
      await waitDialog(page);
      await page.keyboard.type("an toàn");
      await page.waitForTimeout(1200);
    },
  },
  { name: "verify", user: null, path: (ids) => `/verify/${ids.certCode}` },

  // ---------------- Học viên ----------------
  { name: "hv-dashboard", user: "TM-001", path: () => "/dashboard" },
  { name: "hv-dashboard-m", user: "TM-001", path: () => "/dashboard", mobile: true },
  { name: "hv-my-courses", user: "TM-001", path: () => "/my-courses" },
  { name: "hv-course-detail", user: "TM-001", path: (ids) => `/my-courses/${ids.courseSP01}` },
  { name: "hv-video", user: "TM-001", path: (ids) => `/learn/${ids.courseAT01}/${ids.lessonVideoAT01}` },
  { name: "hv-video-m", user: "TM-001", path: (ids) => `/learn/${ids.courseAT01}/${ids.lessonVideoAT01}`, mobile: true },
  { name: "hv-document", user: "TM-001", path: (ids) => `/learn/${ids.courseKN02}/${ids.lessonDocKN02}` },
  { name: "hv-quiz-intro", user: "TM-004", path: (ids) => `/learn/${ids.courseNQ01}/${ids.lessonQuizNQ01}` },
  {
    name: "hv-quiz-review",
    user: "TM-004",
    path: (ids) => `/learn/${ids.courseNQ01}/${ids.lessonQuizNQ01}`,
    prepare: async (page) => {
      await page.getByRole("link", { name: "Xem lại" }).or(page.getByRole("button", { name: "Xem lại" })).first().click();
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(800);
    },
  },
  {
    name: "hv-quiz-player",
    user: "ADMIN",
    path: (ids) => `/content/courses/${ids.courseAT01}?tab=preview&lesson=${ids.lessonQuizAT01}`,
    prepare: async (page) => {
      await click(page, "Làm thử");
      await page.getByRole("button", { name: "Nộp bài" }).first().waitFor();
      await page.locator('input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"]').first().click().catch(() => {});
      await page.waitForTimeout(500);
    },
  },
  { name: "hv-updates", user: "TM-001", path: (ids) => `/my-courses/${ids.courseNQ01}/updates` },
  { name: "hv-path", user: "TM-001", path: (ids) => `/learning-paths/${ids.pathLTKD}` },
  { name: "hv-library", user: "TM-001", path: () => "/library" },
  { name: "hv-library-detail", user: "TM-001", path: (ids) => `/library/${ids.libraryCourse}` },
  { name: "hv-certificates", user: "TM-001", path: () => "/certificates" },
  { name: "hv-notifications", user: "TM-001", path: () => "/notifications" },

  // ---------------- Theo dõi học tập ----------------
  { name: "ql-team", user: "MG-KD", path: () => "/team" },
  { name: "ql-members", user: "MG-KD", path: () => "/team/members" },
  {
    name: "ql-remind",
    user: "MG-KD",
    path: () => "/team/members",
    prepare: async (page) => {
      const boxes = page.getByRole("checkbox");
      await boxes.nth(1).click();
      await boxes.nth(2).click();
      await click(page, /Gửi nhắc nhở/);
      await waitDialog(page);
    },
  },
  { name: "ql-member-detail", user: "MG-KD", path: (ids) => `/team/members/${ids.userTM001}` },
  { name: "ql-reports", user: "MG-KD", path: () => "/reports" },

  // ---------------- Biên soạn nội dung ----------------
  { name: "bs-categories", user: "ADMIN", path: () => "/content/categories" },
  { name: "bs-courses", user: "CE-TONG", path: () => "/content/courses" },
  {
    name: "bs-create-course",
    user: "CE-TONG",
    path: () => "/content/courses",
    prepare: async (page) => {
      await click(page, "Tạo khoá học");
      await waitDialog(page);
    },
  },
  { name: "bs-course-info", user: "ADMIN", path: (ids) => `/content/courses/${ids.courseAT01}` },
  { name: "bs-course-content", user: "ADMIN", path: (ids) => `/content/courses/${ids.courseAT01}?tab=content` },
  {
    name: "bs-add-lesson",
    user: "ADMIN",
    path: (ids) => `/content/courses/${ids.courseAT01}?tab=content`,
    prepare: async (page) => {
      await click(page, "Thêm bài");
      await waitDialog(page);
    },
  },
  {
    name: "bs-lesson-video",
    user: "ADMIN",
    path: (ids) => `/content/courses/${ids.courseAT01}?tab=content`,
    prepare: async (page, ids) => {
      await page.getByText(ids.lessonVideoAT01Title, { exact: true }).first().click();
      await waitDialog(page);
      // Chờ khung YouTube tải ảnh xem trước (không thì ảnh chụp ra khung đen)
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.waitForTimeout(3000);
    },
  },
  { name: "bs-preview", user: "ADMIN", path: (ids) => `/content/courses/${ids.courseAT01}?tab=preview` },
  { name: "bs-versions", user: "ADMIN", path: (ids) => `/content/courses/${ids.courseAT01}?tab=versions` },
  {
    name: "bs-publish-update",
    user: "ADMIN",
    path: (ids) => `/content/courses/${ids.courseAT01}`,
    prepare: async (page) => {
      await click(page, "Phát hành bản cập nhật");
      await waitDialog(page);
    },
  },
  { name: "bs-proposal", user: "ADMIN", path: (ids) => `/content/courses/${ids.courseIT01}` },
  { name: "bs-reviews", user: "ADMIN", path: (ids) => `/content/courses/${ids.courseAT01}?tab=reviews` },
  { name: "bs-questions", user: "ADMIN", path: (ids) => `/content/questions?course=${ids.courseAT01}` },
  {
    name: "bs-question-form",
    user: "ADMIN",
    path: (ids) => `/content/questions?course=${ids.courseAT01}`,
    prepare: async (page) => {
      await click(page, "Thêm câu hỏi");
      await waitDialog(page);
    },
  },
  { name: "bs-question-import", user: "ADMIN", path: () => "/content/questions/import" },
  { name: "bs-paths", user: "ADMIN", path: () => "/content/paths" },
  { name: "bs-path-editor", user: "ADMIN", path: (ids) => `/content/paths/${ids.pathLTKD}` },

  // ---------------- Quản trị công ty ----------------
  { name: "qt-users", user: "CA-TM", path: () => "/org/users" },
  {
    name: "qt-user-form",
    user: "CA-TM",
    path: () => "/org/users",
    prepare: async (page) => {
      await click(page, "Thêm người dùng");
      await waitDialog(page);
    },
  },
  { name: "qt-user-detail", user: "CA-TM", path: (ids) => `/org/users/${ids.userTM001}` },
  { name: "qt-user-import", user: "CA-TM", path: () => "/org/users/import" },
  { name: "qt-departments", user: "CA-TM", path: () => "/org/departments" },
  { name: "qt-positions", user: "ADMIN", path: () => "/org/positions" },
  { name: "qt-assign-list", user: "CA-TM", path: () => "/assign/manual" },
  { name: "qt-assign-wizard", user: "CA-TM", path: () => "/assign/manual/new" },
  { name: "qt-rules", user: "CA-TM", path: () => "/assign/rules" },
  { name: "qt-rule-form", user: "CA-TM", path: () => "/assign/rules/new" },
  { name: "qt-cert-template", user: "CA-TM", path: () => "/system/certificate-templates" },
  { name: "qt-audit", user: "CA-TM", path: () => "/system/audit-logs" },

  // ---------------- Quản trị tập đoàn ----------------
  { name: "td-overview", user: "ADMIN", path: () => "/system/overview" },
  { name: "td-companies", user: "ADMIN", path: () => "/system/companies" },
  { name: "td-settings", user: "ADMIN", path: () => "/system/settings" },
  { name: "td-bunny", user: "ADMIN", path: () => "/system/settings", target: 'section[aria-labelledby="bunny-title"]' },
  { name: "td-jobs", user: "ADMIN", path: () => "/system/jobs" },
  { name: "td-lark", user: "ADMIN", path: () => "/system/lark" },
];
