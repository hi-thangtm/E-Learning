import { expect, test, type Browser, type Page } from "@playwright/test";
import { authFile } from "./helpers/env";
import { createCourse, db, enroll, uid } from "./helpers/db";

/**
 * Kịch bản 11 — Điện thoại (iPhone SE 375×667): trang học viên không cuộn ngang, menu ☰ mở được,
 * học 1 bài tài liệu + làm bài kiểm tra trên màn nhỏ. Trang quản trị giữ bố cục máy tính (không kiểm ở đây).
 */

async function phoneAs(browser: Browser, code: string): Promise<Page> {
  const context = await browser.newContext({
    storageState: authFile(code),
    viewport: { width: 375, height: 667 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  return context.newPage();
}

/** Trang không rộng hơn màn hình (không phải cuộn ngang cả trang) */
async function expectNoHorizontalScroll(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width, `${url} rộng ${width}px > 375px`).toBeLessThanOrEqual(375);
}

test("trang học viên vừa màn hình 375px, menu ☰ mở và chuyển trang được", async ({ browser }) => {
  const { course, lessons } = await createCourse({ title: `Khoá điện thoại ${uid()} có tên khá dài để thử cắt chữ trên màn hình nhỏ`, lessons: [{ type: "VIDEO" }, { type: "DOCUMENT" }, { type: "QUIZ" }] });
  await enroll("TEST-LN5", course.id);
  const library = await db.course.findUniqueOrThrow({ where: { code: "TEST-TU-DANG-KY" } });
  const path = await db.learningPath.findUniqueOrThrow({ where: { code: "TEST-LT" } });
  const page = await phoneAs(browser, "TEST-LN5");

  for (const url of [
    "/dashboard",
    "/my-courses",
    `/my-courses/${course.id}`,
    `/my-courses/${course.id}/updates`,
    `/learn/${course.id}/${lessons[0].id}`,
    "/learning-paths",
    `/learning-paths/${path.id}`,
    "/library",
    `/library/${library.id}`,
    "/certificates",
    "/notifications",
    "/help",
    "/change-password",
    "/verify",
  ]) {
    await expectNoHorizontalScroll(page, url);
  }

  // Sidebar ẩn → nút ☰ mở menu trượt, bấm mục menu thì chuyển trang và menu đóng
  await page.goto("/dashboard");
  await expect(page.getByRole("navigation", { name: "Menu chính" })).toBeHidden();
  await page.getByRole("button", { name: "Mở menu" }).click();
  const menu = page.getByRole("dialog");
  await menu.getByRole("link", { name: "Khoá học của tôi" }).click();
  await expect(page).toHaveURL(/\/my-courses$/);
  await expect(menu).toBeHidden();
});

test("học bài tài liệu và làm bài kiểm tra trên điện thoại", async ({ browser }) => {
  const { course, lessons } = await createCourse({
    title: `Khoá học trên điện thoại ${uid()}`,
    lessons: [{ type: "DOCUMENT", title: "Đọc trên điện thoại" }, { type: "QUIZ", title: "Kiểm tra trên điện thoại", questionCount: 2, passingScore: 100 }, { type: "DOCUMENT", title: "Bài cuối" }],
  });
  await enroll("TEST-LN5", course.id);
  const page = await phoneAs(browser, "TEST-LN5");

  // Tài liệu: đọc đủ 15 giây → xác nhận → nút Bài tiếp theo (đầy chiều ngang) mở bài kiểm tra
  await page.goto(`/learn/${course.id}/${lessons[0].id}`);
  await page.waitForLoadState("networkidle");
  const done = page.getByRole("button", { name: "Đã đọc xong" });
  await expect(done).toBeEnabled({ timeout: 25_000 });
  await done.click();
  await expect(page.getByText("Bạn đã đọc xong bài này.")).toBeVisible();

  // Mục lục là menu trượt trên màn nhỏ
  await page.getByRole("button", { name: "Thu gọn mục lục" }).or(page.getByRole("button", { name: "Mở mục lục" })).first().click();
  const outline = page.getByRole("dialog");
  await expect(outline.getByText("Nội dung khoá học")).toBeVisible();
  await outline.getByRole("link", { name: /Kiểm tra trên điện thoại/ }).click();
  await expect(page).toHaveURL(new RegExp(`/learn/${course.id}/${lessons[1].id}$`));
  await expect(outline).toBeHidden();

  // Bài kiểm tra: ô đáp án đủ lớn để bấm (≥ 44px), nộp bài đạt
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  for (;;) {
    const option = page.locator("label", { hasText: "Đáp án đúng" });
    expect((await option.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await option.click();
    await page.waitForLoadState("networkidle");
    const next = page.getByRole("button", { name: "Câu sau" });
    if (await next.isVisible()) {
      await next.click();
      continue;
    }
    await page.getByRole("button", { name: "Nộp bài" }).first().click();
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Vẫn nộp bài" });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    break;
  }
  await expect(page.getByText("Đạt", { exact: true }).first()).toBeVisible();
  const width = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(width).toBeLessThanOrEqual(375);
});
