import { expect, test, type Browser, type Page } from "@playwright/test";
import { db, resetAccount, uid } from "./helpers/db";
import { PASSWORD, fakeIp } from "./helpers/env";

/**
 * Kịch bản 9 (phần chạy cuối — project "chay-cuoi") — Giới hạn đăng nhập & khoá tạm, KHÔNG có cờ tắt giới hạn:
 * - 10 lần / phút / IP, 5 lần / phút / mã nhân viên (kể cả mã không tồn tại) → "Bạn thao tác quá nhanh…"
 * - Sai mật khẩu 5 lần liên tiếp → khoá tạm 15 phút; chỉ khi nhập ĐÚNG mật khẩu mới báo đang khoá tạm.
 * Dùng tài khoản riêng (TEST-RATE), mã không tồn tại và IP riêng → không ảnh hưởng các test khác.
 */

const INVALID = "Mã nhân viên hoặc mật khẩu không đúng.";
const RATE_LIMITED = "Bạn thao tác quá nhanh, vui lòng thử lại sau.";
const LOCKED = "Tài khoản đang tạm khoá do nhập sai mật khẩu nhiều lần. Vui lòng thử lại sau 15 phút.";

async function loginPage(browser: Browser): Promise<Page> {
  const context = await browser.newContext({ locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle");
  return page;
}

/** Gửi form đăng nhập 1 lần (từ IP `ip`), trả về thông báo lỗi hiển thị */
async function attempt(page: Page, code: string, password: string, ip: string): Promise<string> {
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
  await page.locator('input[name="employeeCode"]').fill(code);
  await page.locator('input[name="password"]').fill(password);
  const done = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/login");
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  await done;
  // React 19 tự xoá ô của <form action> sau khi action xong — chờ xoá xong để lần gửi sau không bị xoá mất mật khẩu vừa điền
  await expect(page.locator('input[name="password"]')).toHaveValue("");
  const alert = page.getByText(new RegExp(`${INVALID}|${RATE_LIMITED}|${LOCKED}`.replace(/\./g, "\\.")));
  await expect(alert).toBeVisible();
  return (await alert.innerText()).trim();
}

test("giới hạn theo IP: lần thứ 11 trong 1 phút từ cùng IP bị chặn", async ({ browser }) => {
  const page = await loginPage(browser);
  const ip = fakeIp(`rate-ip-${uid()}`);
  for (let i = 1; i <= 10; i++) {
    expect(await attempt(page, `KHONG-CO-${uid()}`, "SaiMatKhau1", ip), `lần ${i}`).toBe(INVALID);
  }
  expect(await attempt(page, `KHONG-CO-${uid()}`, "SaiMatKhau1", ip)).toBe(RATE_LIMITED);
  // IP khác vẫn đăng nhập được bình thường
  expect(await attempt(page, `KHONG-CO-${uid()}`, "SaiMatKhau1", fakeIp(`rate-ip-other-${uid()}`))).toBe(INVALID);
});

test("giới hạn theo mã nhân viên: lần thứ 6 trong 1 phút bị chặn dù đổi IP (kể cả mã không tồn tại)", async ({ browser }) => {
  const page = await loginPage(browser);
  const code = `KHONG-CO-${uid()}`;
  for (let i = 1; i <= 5; i++) {
    expect(await attempt(page, code, "SaiMatKhau1", fakeIp(`rate-code-${uid()}`)), `lần ${i}`).toBe(INVALID);
  }
  expect(await attempt(page, code, "SaiMatKhau1", fakeIp(`rate-code-${uid()}`))).toBe(RATE_LIMITED);
});

test("sai mật khẩu 5 lần → khoá tạm; chỉ báo đang khoá khi nhập đúng mật khẩu", async ({ browser }) => {
  await resetAccount("TEST-RATE");
  // 4 lần sai trước đó (đặt thẳng DB để còn lượt trong giới hạn 5 lần / phút / mã)
  await db.user.update({ where: { employeeCode: "TEST-RATE" }, data: { failedLoginCount: 4 } });
  const page = await loginPage(browser);

  // Lần sai thứ 5 → khoá tạm, vẫn chỉ báo chung
  expect(await attempt(page, "TEST-RATE", "SaiMatKhau1", fakeIp(`lock-${uid()}`))).toBe(INVALID);
  const locked = await db.user.findUniqueOrThrow({ where: { employeeCode: "TEST-RATE" } });
  expect(locked.lockedUntil?.getTime() ?? 0).toBeGreaterThan(Date.now() + 14 * 60_000);

  // Đang khoá + sai mật khẩu → báo chung (không lộ trạng thái); đúng mật khẩu → báo khoá tạm, không vào được
  expect(await attempt(page, "TEST-RATE", "SaiMatKhau1", fakeIp(`lock-${uid()}`))).toBe(INVALID);
  expect(await attempt(page, "TEST-RATE", PASSWORD, fakeIp(`lock-${uid()}`))).toBe(LOCKED);
  await expect(page).toHaveURL(/\/login/);

  await resetAccount("TEST-RATE");
});
