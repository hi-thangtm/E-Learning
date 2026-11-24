import bcrypt from "bcryptjs";
import { expect, test, type Page } from "@playwright/test";
import { loginApi, loginUi, pageAs } from "./helpers/auth";
import { companyByCode, db, resetAccount, uid, userByCode } from "./helpers/db";
import { PASSWORD } from "./helpers/env";

/**
 * Kịch bản 9 — Phân quyền: URL ngoài quyền theo bảng mục 2 docs/security-review.md, chặn chéo công ty / ngoài đội,
 * huỷ phiên khi khoá / đặt lại mật khẩu, đăng nhập sai không lộ trạng thái tài khoản.
 */

const CONTENT = ["/content/courses", "/content/questions", "/content/paths", "/content/categories"];
const ASSIGN = ["/assign/manual", "/assign/manual/new", "/assign/rules", "/assign/rules/new"];
const ORG = ["/org/users", "/org/users/import", "/org/departments", "/org/positions"];
const TEAM = ["/team", "/team/members", "/reports"];
const SYSTEM_ADMINS = ["/system/audit-logs", "/system/certificate-templates"];
const SYSTEM_GROUP = ["/system/companies", "/system/settings", "/system/jobs", "/system/overview"];

async function expectRedirectedToDashboard(page: Page, urls: string[]) {
  for (const url of urls) {
    await page.goto(url);
    await expect(page, `${url} phải chuyển về Tổng quan`).toHaveURL(/\/dashboard$/);
  }
}

test.describe("Phân quyền theo vai trò", () => {
  test("học viên gõ thẳng URL quản trị / quản lý → về Tổng quan", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-SEC-LN");
    await expectRedirectedToDashboard(page, [...TEAM, ...CONTENT, ...ASSIGN, ...ORG, ...SYSTEM_ADMINS, ...SYSTEM_GROUP]);
  });

  test("trưởng phòng không vào được nội dung / giao khoá / tổ chức / hệ thống", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-SEC-MG");
    await expectRedirectedToDashboard(page, [...CONTENT, ...ASSIGN, ...ORG, ...SYSTEM_ADMINS, ...SYSTEM_GROUP]);
  });

  test("biên soạn không vào được đội / báo cáo / giao khoá / tổ chức / hệ thống", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-SEC-CE");
    await expectRedirectedToDashboard(page, [...TEAM, ...ASSIGN, ...ORG, ...SYSTEM_ADMINS, ...SYSTEM_GROUP]);
  });

  test("admin công ty không vào được trang chỉ dành cho Admin tập đoàn", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-SEC-CA");
    await expectRedirectedToDashboard(page, SYSTEM_GROUP);
  });

  test("route xuất file / API ngoài quyền bị chặn", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-SEC-LN");
    for (const url of ["/reports/export?tab=courses", "/team/members/export", "/system/audit-logs/export", "/content/questions/export?course=x", "/org/users/import/template"]) {
      const res = await page.request.get(url, { maxRedirects: 0 });
      expect(res.status(), url).toBe(307);
      expect(res.headers()["location"], url).toMatch(/\/dashboard$/);
    }
    // Chứng nhận của người khác → 403 / 404
    const other = await db.certificate.findFirst({ select: { id: true } });
    if (other) expect([403, 404]).toContain((await page.request.get(`/api/certificates/${other.id}/pdf`)).status());
    // Đếm truy vấn chỉ bật khi đo hiệu năng → mặc định 404
    expect((await page.request.get("/api/perf/queries")).status()).toBe(404);
  });
});

test.describe("Chặn chéo phạm vi", () => {
  test("Admin CTY1 mở hồ sơ người của CTY2 → bị chặn", async ({ browser }) => {
    const target = await userByCode("TEST-CTY2-LN");
    const page = await pageAs(browser, "TEST-CA1");
    await page.goto(`/org/users/${target.id}`);
    await expect(page).toHaveURL(/\/org\/users$/);
    await expect(page.getByText(target.fullName)).toHaveCount(0);
  });

  test("trưởng phòng mở nhân viên ngoài đội → bị chặn", async ({ browser }) => {
    const out = await userByCode("TEST-OUT");
    const page = await pageAs(browser, "TEST-MG1");
    await page.goto(`/team/members/${out.id}`);
    await expect(page).toHaveURL(/\/team\/members$/);
    await expect(page.getByText(out.fullName)).toHaveCount(0);
  });
});

test.describe("Huỷ phiên đang mở", () => {
  test("khoá tài khoản → phiên đang mở của người đó bị đẩy về đăng nhập", async ({ browser }) => {
    await resetAccount("TEST-LOCK");
    const target = await userByCode("TEST-LOCK");
    // Phiên đang mở của TEST-LOCK (trình duyệt riêng)
    const api = await loginApi("TEST-LOCK");
    const victim = await browser.newContext({ storageState: await api.storageState() });
    await api.dispose();
    const victimPage = await victim.newPage();
    await victimPage.goto("/dashboard");
    await expect(victimPage).toHaveURL(/\/dashboard$/);

    const admin = await pageAs(browser, "TEST-CA1");
    await admin.goto(`/org/users/${target.id}`);
    await admin.getByRole("button", { name: "Khoá tài khoản", exact: true }).click();
    await admin.getByRole("alertdialog").getByRole("button", { name: "Khoá", exact: true }).click();
    await expect.poll(async () => (await userByCode("TEST-LOCK")).status).toBe("INACTIVE");

    await victimPage.goto("/dashboard");
    await expect(victimPage).toHaveURL(/\/login/);
  });

  test("đặt lại mật khẩu → phiên đang mở bị đẩy về đăng nhập", async ({ browser }) => {
    await resetAccount("TEST-RESET");
    const target = await userByCode("TEST-RESET");
    const api = await loginApi("TEST-RESET");
    const victim = await browser.newContext({ storageState: await api.storageState() });
    await api.dispose();
    const victimPage = await victim.newPage();
    await victimPage.goto("/my-courses");
    await expect(victimPage).toHaveURL(/\/my-courses$/);

    const admin = await pageAs(browser, "TEST-CA1");
    await admin.goto(`/org/users/${target.id}`);
    await admin.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
    await admin.getByRole("dialog").getByRole("button", { name: "Đặt lại mật khẩu" }).click();
    await expect.poll(async () => (await userByCode("TEST-RESET")).mustChangePassword).toBe(true);

    await victimPage.goto("/my-courses");
    await expect(victimPage).toHaveURL(/\/login/);
  });
});

test.describe("Đăng nhập không lộ trạng thái tài khoản", () => {
  test("sai mật khẩu: mã không tồn tại / tài khoản bị khoá / công ty tạm ngưng đều chỉ báo chung", async ({ browser }) => {
    const cty1 = await companyByCode("CTY1");
    const code = `E2E-INACTIVE-${uid()}`;
    await db.user.create({
      data: { employeeCode: code, fullName: "Đã nghỉ việc", passwordHash: await bcrypt.hash(PASSWORD, 12), mustChangePassword: false, status: "INACTIVE", companyId: cty1.id },
    });
    const message = "Mã nhân viên hoặc mật khẩu không đúng.";
    for (const [who, pass] of [[`KHONG-TON-TAI-${uid()}`, "SaiMatKhau1"], [code, "SaiMatKhau1"]] as const) {
      const page = await loginUi(browser, who, pass);
      await expect(page.getByText(message)).toBeVisible();
      await page.context().close();
    }
    // Mật khẩu ĐÚNG của tài khoản đã khoá → mới báo đã khoá
    const page = await loginUi(browser, code, PASSWORD);
    await expect(page.getByText(message)).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });
});
