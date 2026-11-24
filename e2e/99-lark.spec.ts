import { expect, test, type Page } from "@playwright/test";
import { MOCK_LARK_PORT } from "../scripts/test/common";
import { gotoReady, loginUi, pageAs } from "./helpers/auth";
import { companyByCode, db, uid } from "./helpers/db";

/**
 * Kịch bản Lark (Việc L1) — đồng bộ từ Lark GIẢ LẬP (e2e/mock-lark). Chạy ở nhóm “chạy cuối” (99-*) để tác vụ hằng ngày của các kịch bản khác
 * không tự đồng bộ chen vào giữa (sau lần áp dụng tay đầu tiên, tác vụ hằng ngày tự đồng bộ Lark).
 * Dùng 1 công ty riêng tạo trong test; cuối cùng bỏ ghép để không ảnh hưởng lần chạy sau.
 */

const MOCK = `http://localhost:${MOCK_LARK_PORT}`;
const U = uid();
const code = (n: string) => `LK${U}-${n}`;
const ROOT = `od-${U}-root`;
const KD = `od-${U}-kd`;
const KT = `od-${U}-kt`;
const ROOT_NAME = `Công ty Lark E2E ${U}`;

type MockUser = { user_id: string; name: string; employee_no?: string; enterprise_email?: string; mobile?: string; department_ids: string[]; join_time?: number; resigned?: boolean };
const departments = [
  { open_department_id: ROOT, name: ROOT_NAME, parent_department_id: "0" },
  { open_department_id: KD, name: "Phòng Kinh doanh", parent_department_id: ROOT, leader_user_id: `u${U}2` },
  { open_department_id: KT, name: "Phòng Kế toán", parent_department_id: ROOT },
];
const baseUsers = (): MockUser[] => [
  { user_id: `u${U}1`, name: "Lark Người Mới", employee_no: code("01"), mobile: "+84 912 345 678", department_ids: [KD], join_time: 1_767_225_600 },
  { user_id: `u${U}2`, name: "Lark Trưởng Phòng", employee_no: code("02"), enterprise_email: "tp.lark@hungthinh.vn", department_ids: [KD] },
  { user_id: `u${U}3`, name: "Lark Đã Nghỉ", employee_no: code("03"), department_ids: [KT], resigned: true },
  { user_id: `u${U}4`, name: "Lark Thiếu Mã", department_ids: [KT] },
  { user_id: `u${U}5`, name: "Lark Cấp Công Ty", employee_no: code("05"), department_ids: [ROOT] },
  { user_id: `u${U}6`, name: "Lark Bị Admin Khoá", employee_no: code("06"), department_ids: [KT] },
];

async function setLark(users: MockUser[]) {
  const res = await fetch(`${MOCK}/__mock/state`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ departments, users }) });
  expect(res.ok).toBe(true);
}

/** Chạy thử rồi đọc số trên thẻ tổng hợp */
async function preview(page: Page) {
  await page.getByRole("button", { name: "Chạy thử (xem trước)" }).click();
  await expect(page.getByRole("button", { name: /^Tạo mới\s*\d+$/ })).toBeVisible({ timeout: 30_000 });
}
const card = (page: Page, label: string, n: number) => expect(page.getByRole("button", { name: new RegExp(`^${label}\\s*${n}$`) })).toBeVisible();

async function apply(page: Page) {
  await page.getByRole("button", { name: "Áp dụng", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Áp dụng", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toBeHidden({ timeout: 30_000 });
}

test.describe.serial("Đồng bộ Lark", () => {
  let companyId = "";

  test.beforeAll(async () => {
    const tong = await companyByCode("TONG");
    const company = await db.company.create({ data: { code: `LK${U}`, name: `Công ty Lark ${U}`, parentId: tong.id } });
    companyId = company.id;
    // Phòng có sẵn trùng tên → lần đầu được GHÉP (không tạo trùng)
    await db.department.create({ data: { companyId, code: "KD", name: "Phòng kinh doanh" } });
    const hash = (await db.user.findFirstOrThrow({ where: { employeeCode: "TEST-LN1" } })).passwordHash;
    await db.user.create({ data: { employeeCode: code("02"), fullName: "Tên cũ", email: "cu@hungthinh.vn", passwordHash: hash, mustChangePassword: false, companyId } });
    await db.user.create({ data: { employeeCode: code("06"), fullName: "Bị khoá", passwordHash: hash, mustChangePassword: false, companyId, status: "INACTIVE", inactiveSource: "ADMIN" } });
    await setLark(baseUsers());
  });

  test.afterAll(async () => {
    await db.company.update({ where: { id: companyId }, data: { larkDepartmentId: null } });
    await fetch(`${MOCK}/__mock/reset`, { method: "POST" });
  });

  test("kiểm tra kết nối, ghép công ty, chạy thử rồi áp dụng", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-GA");
    await gotoReady(page, "/system/lark");
    await page.getByRole("button", { name: "Kiểm tra kết nối" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Kết nối Lark thành công" })).toBeVisible();

    // Ghép công ty với phòng gốc trên Lark
    await page.getByRole("row", { name: new RegExp(`LK${U}`) }).getByRole("button", { name: "Chọn phòng Lark" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.locator("li", { hasText: ROOT_NAME }).first().getByRole("button", { name: "Chọn", exact: true }).first().click();
    await expect(page.getByRole("row", { name: new RegExp(`LK${U}`) })).toContainText(ROOT_NAME);
    expect((await db.company.findUniqueOrThrow({ where: { id: companyId } })).larkDepartmentId).toBe(ROOT);

    await preview(page);
    await card(page, "Tạo mới", 2); // 01 (phòng KD) + 05 (cấp công ty)
    await card(page, "Cập nhật", 1); // 02 gắn Lark + email + họ tên + phòng
    await card(page, "Khoá", 0);
    await card(page, "Bỏ qua", 3); // 03 đã nghỉ, thiếu mã, 06 bị Admin khoá
    await apply(page);

    const created = await db.user.findUniqueOrThrow({ where: { employeeCode: code("01") }, include: { department: true } });
    expect(created.larkUserId).toBe(`u${U}1`);
    expect(created.passwordSet).toBe(false);
    expect(created.role).toBe("LEARNER");
    expect(created.phone).toBe("0912345678");
    expect(created.department?.code).toBe("KD"); // phòng có sẵn được ghép
    expect(created.department?.larkDepartmentId).toBe(KD);
    expect((await db.user.findUniqueOrThrow({ where: { employeeCode: code("05") } })).departmentId).toBeNull();

    const leader = await db.user.findUniqueOrThrow({ where: { employeeCode: code("02") } });
    expect(leader.larkUserId).toBe(`u${U}2`);
    expect(leader.email).toBe("tp.lark@hungthinh.vn");
    expect(leader.fullName).toBe("Lark Trưởng Phòng");
    expect(leader.role).toBe("MANAGER"); // trưởng phòng Lark → nâng vai trò
    expect((await db.department.findFirstOrThrow({ where: { companyId, code: "KD" } })).managerId).toBe(leader.id);
    const kt = await db.department.findFirstOrThrow({ where: { companyId, larkDepartmentId: KT } });
    expect(kt.code).toMatch(/^LK-[0-9A-F]{6,}$/);
    expect((await db.user.findUniqueOrThrow({ where: { employeeCode: code("06") } })).status).toBe("INACTIVE"); // Admin khoá: không tự mở
    expect(await db.auditLog.count({ where: { action: "LARK_SYNC_RUN", metadata: { path: ["applied"], equals: true } } })).toBeGreaterThan(0);

    // Người mới từ Lark chưa có mật khẩu → đăng nhập bằng mật khẩu luôn sai
    const guest = await loginUi(browser, code("01"));
    await expect(guest.getByRole("alert")).toBeVisible();
    await expect(guest).toHaveURL(/\/login/);
    await guest.context().close();

    // Trang người dùng: badge Lark, các trường nguồn Lark chỉ đọc
    await gotoReady(page, `/org/users/${created.id}`);
    await expect(page.getByText("Lark", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Chưa có mật khẩu")).toBeVisible();
    await page.getByRole("button", { name: "Sửa thông tin" }).click();
    const edit = page.getByRole("dialog");
    await expect(edit.locator("#fullName")).toHaveAttribute("readonly", "");
    await expect(edit.getByText(/Tài khoản đồng bộ từ Lark/)).toBeVisible();
  });

  test("chốt chặn khi khoá hàng loạt, khoá theo Lark rồi mở lại", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-GA");
    // Cần số người bị khoá vượt 5% người đang hoạt động (hoặc > 20)
    const active = await db.user.count({ where: { status: "ACTIVE" } });
    const need = Math.min(21, Math.floor(active * 0.05) + 1);
    const extra: MockUser[] = Array.from({ length: Math.max(0, need - 3) }, (_, i) => ({
      user_id: `u${U}x${i}`,
      name: `Lark Thêm ${i + 1}`,
      employee_no: code(`X${i}`),
      department_ids: [KT],
    }));
    if (extra.length) {
      await setLark([...baseUsers(), ...extra]);
      await gotoReady(page, "/system/lark");
      await preview(page);
      await card(page, "Tạo mới", extra.length);
      await apply(page);
    }

    // Mọi người đang liên kết nghỉ việc trên Lark → chạm chốt chặn
    const linked = [...baseUsers().filter((u) => ["01", "02", "05"].some((n) => u.employee_no === code(n))), ...extra];
    await setLark([...baseUsers().filter((u) => !linked.includes(u)), ...linked.map((u) => ({ ...u, resigned: true }))]);
    await gotoReady(page, "/system/lark");
    await preview(page);
    await card(page, "Khoá", linked.length);
    await expect(page.getByRole("alert").filter({ hasText: "Chạm chốt chặn" })).toBeVisible();
    const applyButton = page.getByRole("button", { name: "Áp dụng", exact: true });
    await expect(applyButton).toBeDisabled();
    await page.getByLabel("Tôi đã kiểm tra, vẫn áp dụng").check();
    await apply(page);
    const locked = await db.user.findUniqueOrThrow({ where: { employeeCode: code("01") } });
    expect(locked.status).toBe("INACTIVE");
    expect(locked.inactiveSource).toBe("LARK");

    // Lark báo đang làm lại → tự mở (chỉ người bị khoá do Lark)
    await setLark([...baseUsers(), ...extra]);
    await gotoReady(page, "/system/lark");
    await preview(page);
    await card(page, "Mở lại", linked.length);
    await apply(page);
    const reopened = await db.user.findUniqueOrThrow({ where: { employeeCode: code("01") } });
    expect(reopened.status).toBe("ACTIVE");
    expect(reopened.inactiveSource).toBeNull();
    expect((await db.user.findUniqueOrThrow({ where: { employeeCode: code("06") } })).status).toBe("INACTIVE");
  });

  test("nhập App ID / App Secret trên giao diện: secret mã hoá, không hiện lại; xoá → quay về .env", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-GA");
    const secret = `e2e-secret-${U}-ZXCV9876`;
    await gotoReady(page, "/system/lark");
    await expect(page.getByText("Đang dùng file .env")).toBeVisible();
    await page.locator("#lark-app-id").fill(`cli_e2e${U.toLowerCase()}`);
    await page.locator("#lark-app-secret").fill(secret);
    await page.getByRole("button", { name: "Lưu cấu hình" }).click();
    await expect(page.getByText("Đã cấu hình trên giao diện")).toBeVisible();
    await expect(page.getByText("Đã lưu (••••9876)")).toBeVisible();

    // Secret không bao giờ gửi về trình duyệt; trong database đã mã hoá
    const html = await (await page.request.get("/system/lark")).text();
    expect(html).not.toContain(secret);
    const stored = await db.systemSetting.findUniqueOrThrow({ where: { key: "LARK_CREDENTIALS" } });
    expect(JSON.stringify(stored.value)).not.toContain(secret);
    expect((stored.value as { secret: string }).secret).toMatch(/^v1:/);

    await page.getByRole("button", { name: "Xoá cấu hình" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Xoá", exact: true }).click();
    await expect(page.getByText("Đang dùng file .env")).toBeVisible();
    expect(await db.systemSetting.count({ where: { key: "LARK_CREDENTIALS" } })).toBe(0);
  });
});
