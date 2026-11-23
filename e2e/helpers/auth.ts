import { expect, request, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { BASE_URL, PASSWORD, authFile, fakeIp } from "./env";

/**
 * Đăng nhập Auth.js bằng API (CSRF + credentials) — giống scripts/bench-pages.ts.
 * Trả về APIRequestContext đã có cookie phiên (dùng `storageState()` để lưu cho trình duyệt).
 */
export async function loginApi(code: string, password = PASSWORD, ip = fakeIp(code)): Promise<APIRequestContext> {
  const ctx = await request.newContext({ baseURL: BASE_URL, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const csrf = await ctx.get("/api/auth/csrf");
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const res = await ctx.post("/api/auth/callback/credentials", {
    form: { csrfToken, employeeCode: code, password, callbackUrl: `${BASE_URL}/dashboard` },
    maxRedirects: 0,
  });
  const location = res.headers()["location"] ?? "";
  const state = await ctx.storageState();
  if (!state.cookies.some((c) => c.name.includes("session-token"))) {
    await ctx.dispose();
    throw new Error(`Đăng nhập ${code} thất bại (${res.status()} ${location})`);
  }
  return ctx;
}

/** Trang trình duyệt đã đăng nhập bằng tài khoản `code` (dùng storageState của global setup). */
export async function pageAs(browser: Browser, code: string): Promise<Page> {
  const context = await browser.newContext({ storageState: authFile(code), locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  return context.newPage();
}

/** Đăng nhập qua GIAO DIỆN (form /login) với IP riêng. */
export async function loginUi(browser: Browser, code: string, password = PASSWORD, ip = fakeIp()): Promise<Page> {
  const context = await browser.newContext({ extraHTTPHeaders: { "x-forwarded-for": ip }, locale: "vi-VN", timezoneId: "Asia/Ho_Chi_Minh" });
  const page = await context.newPage();
  await page.goto("/login");
  await page.locator('input[name="employeeCode"]').fill(code);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click();
  return page;
}

/** Mở trang và chờ tải xong (React đã gắn sự kiện) — dùng trước khi chọn file / gõ vào ô client */
export async function gotoReady(page: Page, url: string) {
  await page.goto(url);
  await page.waitForLoadState("networkidle");
}

/** Chờ thông báo toast (sonner) có chứa `text` */
export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}
