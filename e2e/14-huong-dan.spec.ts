import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";

/**
 * Kịch bản 14 — Trang Hướng dẫn sử dụng (/help): mở từ menu tài khoản, chỉ hiện chương đúng vai trò,
 * tìm kiếm không dấu, ảnh minh hoạ tải được và phóng to được.
 */

const manifest = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../src/lib/help/shots-manifest.json"), "utf8")) as Record<string, unknown>;

test("học viên: mở từ menu tài khoản, chỉ thấy chương dành cho mình, tìm kiếm không dấu", async ({ browser }) => {
  const page = await pageAs(browser, "TEST-LN1");
  await gotoReady(page, "/dashboard");
  await page.getByRole("button", { name: "Tài khoản của tôi" }).click();
  await page.getByRole("menuitem", { name: "Hướng dẫn sử dụng" }).click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole("heading", { level: 1, name: "Hướng dẫn sử dụng" })).toBeVisible();

  const chapters = page.getByRole("navigation", { name: "Các chương hướng dẫn" });
  for (const name of ["Bắt đầu", "Học viên", "Câu hỏi thường gặp"]) {
    await expect(chapters.getByRole("link", { name })).toBeVisible();
  }
  for (const name of ["Theo dõi học tập", "Biên soạn nội dung", "Quản trị công ty", "Quản trị tập đoàn"]) {
    await expect(chapters.getByRole("link", { name })).toHaveCount(0);
  }
  // Mục chỉ dành cho vai trò khác cũng bị ẩn (Tìm nhanh — không có với học viên)
  await expect(page.locator("#tim-nhanh")).toHaveCount(0);

  // Chương không thuộc vai trò → về chương đầu
  await gotoReady(page, "/help?c=quan-tri-tap-doan");
  await expect(page.getByRole("heading", { level: 2, name: "Bắt đầu" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Kết nối Lark" })).toHaveCount(0);

  // Tìm không dấu → bấm kết quả → tới đúng mục
  await page.getByRole("searchbox", { name: "Tìm trong hướng dẫn" }).fill("doi mat khau");
  const result = page.getByRole("region", { name: "Tìm trong hướng dẫn" }).getByRole("link", { name: /^Đổi mật khẩu/ }).first();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page).toHaveURL(/#doi-mat-khau$/);
  await expect(page.getByRole("heading", { level: 3, name: "Đổi mật khẩu" })).toBeInViewport();

  // Chương Học viên qua liên kết chương
  await chapters.getByRole("link", { name: "Học viên" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Học viên" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Bài kiểm tra" })).toBeVisible();
  await page.close();
});

test("Admin tập đoàn: thấy đủ 7 chương; ảnh minh hoạ tải được và bấm để phóng to", async ({ browser }) => {
  const page = await pageAs(browser, "TEST-GA");
  await gotoReady(page, "/help?c=quan-tri-tap-doan");
  const chapters = page.getByRole("navigation", { name: "Các chương hướng dẫn" });
  await expect(chapters.getByRole("link")).toHaveCount(7);
  await expect(page.getByRole("heading", { level: 2, name: "Quản trị tập đoàn" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Kết nối Lark" })).toBeVisible();

  // Mọi ảnh trong manifest có thật trên máy chủ
  const names = Object.keys(manifest);
  expect(names.length).toBeGreaterThan(30);
  for (const name of names) {
    const res = await page.request.get(`/images/help/${name}.jpg`);
    expect(res.status(), name).toBe(200);
  }

  // Ảnh đầu tiên hiển thị được và phóng to trong hộp thoại
  const zoom = page.getByRole("button", { name: /^Phóng to ảnh:/ }).first();
  await zoom.scrollIntoViewIfNeeded();
  const img = zoom.locator("img");
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await zoom.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect.poll(() => dialog.locator("img").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.close();
});
