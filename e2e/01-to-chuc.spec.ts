import { expect, test } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { companyByCode, db, departmentByCode, uid } from "./helpers/db";
import { makeXlsx } from "./helpers/files";

/** Kịch bản 1 — Dựng tổ chức: công ty con + admin, phòng ban cha / con + trưởng phòng, import nhân viên, đổi tên hệ thống. */

test("Admin tập đoàn tạo công ty con và tài khoản admin công ty", async ({ browser }) => {
  const page = await pageAs(browser, "TEST-GA");
  const code = `C${uid()}`;
  await gotoReady(page, "/system/companies");
  await page.getByRole("button", { name: "Thêm công ty con" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#code").fill(code);
  await dialog.locator("#name").fill(`Công ty E2E ${code}`);
  await dialog.getByRole("button", { name: "Thêm công ty con", exact: true }).click();
  await expect(dialog).toBeHidden();
  // Lọc theo mã (danh sách xếp theo mã, phân trang — mỗi lượt chạy thêm công ty mới)
  await gotoReady(page, `/system/companies?q=${code}`);
  await expect(page.getByRole("cell", { name: code, exact: true })).toBeVisible();
  const company = await companyByCode(code);
  expect(company.parentId).not.toBeNull();

  const admin = `${code}-ADMIN`;
  await page.getByRole("button", { name: `Thao tác khác cho ${code}` }).click();
  await page.getByRole("menuitem", { name: "Tạo tài khoản admin" }).click();
  const adminDialog = page.getByRole("dialog");
  await adminDialog.locator("#employeeCode").fill(admin);
  await adminDialog.locator("#fullName").fill("Admin Công ty E2E");
  await adminDialog.locator('input[name="password"]').fill("MatKhauTam1");
  await adminDialog.getByRole("button", { name: "Tạo tài khoản" }).click();
  await expect.poll(async () => (await db.user.findUnique({ where: { employeeCode: admin } }))?.role).toBe("COMPANY_ADMIN");
  const created = await db.user.findUniqueOrThrow({ where: { employeeCode: admin } });
  expect(created.companyId).toBe(company.id);
  expect(created.mustChangePassword).toBe(true);
});

test("Admin công ty tạo phòng ban cha / con và chỉ định trưởng phòng (vai trò thành Trưởng phòng)", async ({ browser }) => {
  const cty1 = await companyByCode("CTY1");
  const kd = await departmentByCode("CTY1", "KD");
  const u = uid();
  const managerCode = `E2E-MG-${u}`;
  const manager = await db.user.create({
    data: { employeeCode: managerCode, fullName: `Trưởng phòng mới ${u}`, passwordHash: "x", mustChangePassword: false, companyId: cty1.id, departmentId: kd.id },
  });

  const page = await pageAs(browser, "TEST-CA1");
  await gotoReady(page, "/org/departments");
  // Phòng cha
  await page.getByRole("button", { name: "Thêm phòng ban" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("#code").fill(`P${u}`);
  await dialog.locator("#name").fill(`Phòng E2E ${u}`);
  await dialog.getByRole("button", { name: "Thêm phòng ban", exact: true }).click();
  await expect(dialog).toBeHidden();
  const parent = await departmentByCode("CTY1", `P${u}`);

  // Phòng con + trưởng phòng
  await page.getByRole("button", { name: "Thêm phòng ban" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.locator("#code").fill(`P${u}-N1`);
  await dialog.locator("#name").fill(`Nhóm E2E ${u}`);
  await dialog.locator("#parent-select").click();
  await page.getByRole("option", { name: new RegExp(`Phòng E2E ${u} \\(P${u}\\)`) }).click();
  await dialog.locator("#manager-input").fill(managerCode);
  await page.getByRole("option", { name: new RegExp(managerCode) }).click();
  await dialog.getByRole("button", { name: "Thêm phòng ban", exact: true }).click();
  await expect(dialog).toBeHidden();

  const child = await departmentByCode("CTY1", `P${u}-N1`);
  expect(child.parentId).toBe(parent.id);
  expect(child.managerId).toBe(manager.id);
  expect((await db.user.findUniqueOrThrow({ where: { id: manager.id } })).role).toBe("MANAGER");
});

test("Admin công ty import nhân viên từ file Excel", async ({ browser }) => {
  const u = uid();
  const codes = [`E2E-IMP-${u}-1`, `E2E-IMP-${u}-2`];
  const file = await makeXlsx(
    "Nhân viên",
    ["Mã NV*", "Họ tên*", "Email", "Điện thoại", "Mã phòng ban", "Mã chức danh", "Ngày vào làm (dd/MM/yyyy)", "Vai trò"],
    [
      [codes[0], "Nguyễn Văn Import", `imp1-${u.toLowerCase()}@test.vn`, "0901000001", "KD", "NVKD", "01/03/2024", "Học viên"],
      [codes[1], "Trần Thị Import", `imp2-${u.toLowerCase()}@test.vn`, "0901000002", "KD-N1", "NVKD", "15/06/2025", "Học viên"],
    ],
  );
  const page = await pageAs(browser, "TEST-CA1");
  await gotoReady(page, "/org/users/import");
  await page.locator('input[type="file"]').setInputFiles({ name: "nhan-vien.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: file });
  await page.getByRole("button", { name: "Kiểm tra file" }).click();
  await page.getByRole("button", { name: "Xác nhận import" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^Import [\d.]+ người$/ }).click();
  await expect(page.getByText("Đã import xong")).toBeVisible();

  const users = await db.user.findMany({ where: { employeeCode: { in: codes } }, include: { department: true } });
  expect(users).toHaveLength(2);
  for (const user of users) {
    expect(user.mustChangePassword).toBe(true);
    expect(user.role).toBe("LEARNER");
  }
  expect(users.find((x) => x.employeeCode === codes[1])?.department?.code).toBe("KD-N1");
});

test("Admin tập đoàn đổi tên hệ thống → sidebar và trang đăng nhập đổi theo", async ({ browser }) => {
  const name = `Học viện E2E ${uid()}`;
  try {
    const page = await pageAs(browser, "TEST-GA");
    await gotoReady(page, "/system/settings");
    await page.locator("#SYSTEM_NAME").fill(name);
    await page.locator("form", { has: page.locator("#SYSTEM_NAME") }).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
    await expect.poll(async () => (await db.systemSetting.findUnique({ where: { key: "SYSTEM_NAME" } }))?.value).toBe(name);

    await page.goto("/dashboard");
    await expect(page.getByText(name).first()).toBeVisible();
    await expect(page).toHaveTitle(new RegExp(name));

    const guest = await browser.newContext();
    const login = await guest.newPage();
    await login.goto("/login");
    await expect(login.getByText(name).first()).toBeVisible();
    await guest.close();
  } finally {
    // Trả lại tên mặc định để không ảnh hưởng kịch bản khác
    await db.systemSetting.deleteMany({ where: { key: "SYSTEM_NAME" } });
  }
});
