import { expect, test, type Page } from "@playwright/test";
import { gotoReady, loginUi, pageAs } from "./helpers/auth";
import { pickDate } from "./helpers/date";
import { companyByCode, createCourse, createLearner, db, enroll } from "./helpers/db";

/**
 * Kịch bản 13 — Sửa sau rà giao diện (Việc 33, docs/ui-review.md): chặn lỗi chức năng F1, F2, F4, F9 quay lại
 * và ô chọn ngày riêng (#70).
 */

/** Ngày yyyy-MM-dd theo giờ Việt Nam, cách hôm nay `d` ngày */
const vnIso = (d: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(Date.now() + d * 86_400_000));
const dmy = (iso: string) => iso.split("-").reverse().join("/");

test("F1 — trang chi tiết người dùng (/org/users/[id]) hiện các lượt học", async ({ browser }) => {
  const { course } = await createCourse({ title: "Khoá hiện ở chi tiết người dùng E2E" });
  const learner = await createLearner();
  await enroll(learner.employeeCode, course.id);

  const page = await pageAs(browser, "TEST-CA1");
  await gotoReady(page, `/org/users/${learner.id}`);
  await expect(page.getByRole("cell", { name: /Khoá hiện ở chi tiết người dùng E2E/ })).toBeVisible();
  await expect(page.getByText("Chưa được giao khoá học nào")).toHaveCount(0);
});

test("F2 — quy tắc đang tắt: trang chi tiết báo rõ và có nút “Bật lại quy tắc”", async ({ browser }) => {
  const { course } = await createCourse({ title: "Khoá quy tắc tắt E2E" });
  const cty1 = await companyByCode("CTY1");
  const rule = await db.assignmentRule.create({
    data: { ownerCompanyId: cty1.id, targetCompanyId: cty1.id, name: `Quy tắc tắt ${course.code}`, courseId: course.id, isActive: false, dueInDays: 14 },
  });

  const page = await pageAs(browser, "TEST-CA1");
  await gotoReady(page, `/assign/rules/${rule.id}`);
  await expect(page.getByText(/Quy tắc đang tắt/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Lưu thay đổi" })).toBeVisible();
  await page.getByRole("button", { name: "Bật lại quy tắc" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Bật lại", exact: true }).click();
  await expect.poll(async () => (await db.assignmentRule.findUniqueOrThrow({ where: { id: rule.id } })).isActive).toBe(true);
  await expect(page.getByRole("button", { name: "Tắt quy tắc" })).toBeVisible();
});

test("F4 — Tổng quan học viên có thẻ “Chưa bắt đầu”, bấm vào lọc đúng tab", async ({ browser }) => {
  const { course } = await createCourse({ title: "Khoá chưa bắt đầu E2E" });
  const learner = await createLearner();
  await enroll(learner.employeeCode, course.id); // NOT_STARTED

  const page = await loginUi(browser, learner.employeeCode);
  await expect(page).toHaveURL(/\/dashboard$/);
  const card = page.getByRole("link", { name: /Chưa bắt đầu/ });
  await expect(card).toContainText("1");
  await card.click();
  await expect(page).toHaveURL(/\/my-courses\?tab=notStarted$/);
  await expect(page.getByText("Khoá chưa bắt đầu E2E").first()).toBeVisible();
});

test("F9 — tab Thông tin có thay đổi chưa lưu: chuyển tab phải hỏi “Bỏ thay đổi chưa lưu?”", async ({ browser }) => {
  const { course } = await createCourse({ title: "Khoá thử thay đổi chưa lưu E2E" });
  const page = await pageAs(browser, "TEST-CA1");
  await gotoReady(page, `/content/courses/${course.id}`);
  await page.locator("#title").fill("Tên mới chưa lưu");

  await page.getByRole("link", { name: "Nội dung" }).click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm.getByText("Bỏ thay đổi chưa lưu?")).toBeVisible();
  await confirm.getByRole("button", { name: "Ở lại" }).click();
  await expect(confirm).toBeHidden();
  await expect(page.locator("#title")).toHaveValue("Tên mới chưa lưu");

  await page.getByRole("link", { name: "Nội dung" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Bỏ thay đổi" }).click();
  await expect(page).toHaveURL(/tab=content/);
  expect((await db.course.findUniqueOrThrow({ where: { id: course.id } })).title).toBe("Khoá thử thay đổi chưa lưu E2E");
});

test("#70 — ô chọn ngày hiện dd/MM/yyyy và ghi yyyy-MM-dd lên URL", async ({ browser }) => {
  const page = await pageAs(browser, "TEST-CA1");
  await gotoReady(page, "/system/audit-logs");
  const from = page.getByRole("button", { name: /^Từ ngày: / });
  await expect(from).toHaveText(/Từ\s*\d{2}\/\d{2}\/\d{4}/);

  const iso = vnIso(-10);
  await pickDate(page, from, iso);
  await expect(page).toHaveURL(new RegExp(`from=${iso}`));
  await expect(page.getByRole("button", { name: /^Từ ngày: / })).toContainText(dmy(iso));
});

test("menu bên trái: nhóm theo vai trò, tên mới, thu gọn nhóm và nhớ sau khi tải lại", async ({ browser }) => {
  const menu = (page: Page) => page.getByRole("navigation", { name: "Menu chính" });
  const group = (page: Page, name: string) => menu(page).getByRole("button", { name, exact: true });
  /** Danh sách mục của 1 nhóm (ul được nút tiêu đề nhóm trỏ tới qua aria-controls) */
  const itemsOf = async (page: Page, name: string) => page.locator(`[id="${await group(page, name).getAttribute("aria-controls")}"]`);

  // Học viên: chỉ nhóm Học tập
  const learner = await pageAs(browser, "TEST-LN1");
  await gotoReady(learner, "/dashboard");
  await expect(menu(learner).getByRole("button")).toHaveCount(1);
  await expect(group(learner, "Học tập")).toBeVisible();
  for (const name of ["Tổng quan", "Khoá học của tôi", "Lộ trình của tôi", "Thư viện khoá học", "Chứng nhận của tôi"]) {
    await expect(menu(learner).getByRole("link", { name, exact: true })).toBeVisible();
  }
  await learner.close();

  // Trưởng phòng: Học tập + Theo dõi học tập; không có Giao khoá / Tổ chức
  const manager = await pageAs(browser, "TEST-MG1");
  await gotoReady(manager, "/team/members");
  await expect(manager.getByRole("heading", { level: 1, name: "Tiến độ từng người" })).toBeVisible();
  await expect(manager.getByRole("navigation", { name: "Vị trí trang" })).toContainText("Theo dõi học tập");
  const follow = await itemsOf(manager, "Theo dõi học tập");
  for (const name of ["Tình hình học tập", "Tiến độ từng người", "Báo cáo"]) {
    await expect(follow.getByRole("link", { name, exact: true })).toBeVisible();
  }
  await expect(follow.getByRole("link", { name: "Tổng quan tập đoàn" })).toHaveCount(0);
  await expect(group(manager, "Giao khoá")).toHaveCount(0);
  await expect(group(manager, "Tổ chức")).toHaveCount(0);
  // Nhóm chứa trang đang mở không thu gọn được
  await expect(group(manager, "Theo dõi học tập")).toBeDisabled();

  // Thu gọn nhóm Học tập (không chứa trang đang mở) → ẩn mục; tải lại vẫn thu gọn; bấm lại thì mở
  await group(manager, "Học tập").click();
  await expect(group(manager, "Học tập")).toHaveAttribute("aria-expanded", "false");
  await expect(menu(manager).getByRole("link", { name: "Khoá học của tôi" })).toBeHidden();
  await gotoReady(manager, "/team/members");
  await expect(group(manager, "Học tập")).toHaveAttribute("aria-expanded", "false");
  await expect(menu(manager).getByRole("link", { name: "Khoá học của tôi" })).toBeHidden();
  await group(manager, "Học tập").click();
  await expect(menu(manager).getByRole("link", { name: "Khoá học của tôi" })).toBeVisible();
  await manager.close();

  // Admin tập đoàn: Tổng quan tập đoàn ở Theo dõi học tập, Công ty con ở Tổ chức
  const admin = await pageAs(browser, "TEST-GA");
  await gotoReady(admin, "/dashboard");
  await expect((await itemsOf(admin, "Theo dõi học tập")).getByRole("link", { name: "Tổng quan tập đoàn" })).toBeVisible();
  await expect((await itemsOf(admin, "Tổ chức")).getByRole("link", { name: "Công ty con" })).toBeVisible();
  for (const name of ["Giao khoá học", "Quy tắc giao tự động", "Lộ trình học", "Danh mục khoá học", "Nhật ký thao tác", "Cài đặt hệ thống"]) {
    await expect(menu(admin).getByRole("link", { name, exact: true })).toBeVisible();
  }
  await admin.close();
});
