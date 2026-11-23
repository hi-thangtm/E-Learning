import { expect, test } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { companyByCode, createCourse, daysFromNow, db, departmentByCode, uid, userByCode } from "./helpers/db";

/** Kịch bản 3 — Giao khoá: quy tắc theo phòng ban (gồm / không gồm phòng con), người mới / chuyển phòng tự được giao, giao thủ công, gia hạn, huỷ. */

async function enrolledCodes(courseId: string) {
  const rows = await db.enrollment.findMany({ where: { courseId, status: { not: "CANCELLED" } }, select: { user: { select: { employeeCode: true } }, source: true } });
  return rows.map((r) => r.user.employeeCode);
}

for (const includeSub of [true, false]) {
  test(`quy tắc tự động theo phòng Kinh doanh ${includeSub ? "GỒM" : "KHÔNG gồm"} phòng con`, async ({ browser }) => {
    const { course } = await createCourse({ title: `Khoá quy tắc ${includeSub ? "gồm" : "không gồm"} con` });
    const page = await pageAs(browser, "TEST-CA1");
    await gotoReady(page, `/assign/rules/new?courseId=${course.id}`);
    await page.locator("#name").fill(`Quy tắc E2E ${course.code}`);
    await page.locator("#dueInDays").fill("30");
    await page.locator("#department-select").click();
    await page.getByRole("option", { name: /Phòng Kinh doanh/ }).first().click();
    const sub = page.getByRole("switch");
    if ((await sub.getAttribute("aria-checked")) !== String(includeSub)) await sub.click();
    await page.getByRole("button", { name: "Tạo và giao ngay" }).click();

    await expect.poll(() => enrolledCodes(course.id)).toContain("TEST-LN1");
    const codes = await enrolledCodes(course.id);
    expect(codes).toContain("TEST-LN2");
    expect(codes).toContain("TEST-MG1");
    expect(codes).not.toContain("TEST-OUT");
    if (includeSub) expect(codes).toContain("TEST-LN3"); // ở phòng con KD-N1
    else expect(codes).not.toContain("TEST-LN3");
    const rule = await db.assignmentRule.findFirstOrThrow({ where: { courseId: course.id } });
    expect(rule.includeSubDepartments).toBe(includeSub);
    expect(await db.enrollment.count({ where: { courseId: course.id, source: { not: "RULE" } } })).toBe(0);
  });
}

test("người mới vào phòng và người chuyển phòng tự được giao theo quy tắc đang chạy", async ({ browser }) => {
  const { course } = await createCourse({ title: "Khoá cho người vào sau" });
  const cty1 = await companyByCode("CTY1");
  const kd = await departmentByCode("CTY1", "KD");
  const kt = await departmentByCode("CTY1", "KT");
  await db.assignmentRule.create({
    data: { ownerCompanyId: cty1.id, targetCompanyId: cty1.id, name: `Quy tắc vào sau ${course.code}`, courseId: course.id, departmentId: kd.id, includeSubDepartments: true, dueInDays: 14 },
  });
  const page = await pageAs(browser, "TEST-CA1");

  // Người mới (tạo qua giao diện) ở phòng Kinh doanh
  const newCode = `E2E-NEW-${uid()}`;
  await gotoReady(page, "/org/users");
  await page.getByRole("button", { name: "Thêm người dùng" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.locator("#employeeCode").fill(newCode);
  await dialog.locator("#fullName").fill("Người mới vào phòng KD");
  await dialog.locator("#department-select").click();
  await page.getByRole("option", { name: /Phòng Kinh doanh/ }).first().click();
  const password = dialog.locator("#password");
  if (await password.isVisible()) await password.fill("MatKhauTam1");
  await dialog.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
  await expect.poll(() => enrolledCodes(course.id)).toContain(newCode);

  // Người chuyển từ phòng Kế toán sang Kinh doanh
  const moveCode = `E2E-MOVE-${uid()}`;
  const mover = await db.user.create({ data: { employeeCode: moveCode, fullName: "Người chuyển phòng", passwordHash: "x", mustChangePassword: false, companyId: cty1.id, departmentId: kt.id } });
  expect(await enrolledCodes(course.id)).not.toContain(moveCode);
  await gotoReady(page, `/org/users/${mover.id}`);
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  const edit = page.getByRole("dialog");
  await edit.locator("#department-select").click();
  await page.getByRole("option", { name: /Phòng Kinh doanh/ }).first().click();
  await edit.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect.poll(() => enrolledCodes(course.id)).toContain(moveCode);
  const e = await db.enrollment.findFirstOrThrow({ where: { courseId: course.id, user: { employeeCode: moveCode } } });
  expect(e.source).toBe("RULE");
});

test("giao thủ công cho 1 người, gia hạn rồi huỷ giao", async ({ browser }) => {
  const { course } = await createCourse({ title: `Khoá giao tay ${uid()}` });
  const learner = await userByCode("TEST-LN5");
  const page = await pageAs(browser, "TEST-CA1");

  await gotoReady(page, "/assign/manual/new");
  await page.getByLabel(/Tìm khoá học/).fill(course.code);
  await page.getByRole("button", { name: new RegExp(course.code) }).click();
  await page.getByRole("radio", { name: /Thủ công/ }).or(page.locator('[title="Thủ công — chọn từng người"]')).first().click();
  await page.getByLabel("Tìm học viên").fill("TEST-LN5");
  await page.getByRole("checkbox", { name: `Chọn ${learner.fullName}` }).check();
  await page.getByRole("button", { name: "Tiếp: đặt hạn" }).click();
  await page.getByRole("button", { name: /Xác nhận giao \(1 thay đổi\)/ }).click();
  await expect(page).toHaveURL(/\/assign\/manual(\?|$)/);
  const enrollment = await db.enrollment.findFirstOrThrow({ where: { courseId: course.id, userId: learner.id } });
  expect(enrollment.source).toBe("ASSIGNED");
  expect(enrollment.status).toBe("NOT_STARTED");

  // Gia hạn
  await gotoReady(page, `/assign/manual?course=${course.id}`);
  const menu = page.getByRole("button", { name: `Thao tác cho lượt giao của ${learner.fullName} (TEST-LN5)` });
  await menu.click();
  await page.getByRole("menuitem", { name: "Gia hạn" }).click();
  const newDue = daysFromNow(60).toISOString().slice(0, 10);
  await page.getByRole("dialog").locator("#extend-date").fill(newDue);
  await page.getByRole("dialog").getByRole("button", { name: "Gia hạn", exact: true }).click();
  await expect.poll(async () => (await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).dueDate?.toISOString().slice(0, 10)).toBe(newDue);

  // Huỷ giao
  await menu.click();
  await page.getByRole("menuitem", { name: /Huỷ giao/ }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Huỷ giao" }).click();
  await expect.poll(async () => (await db.enrollment.findUniqueOrThrow({ where: { id: enrollment.id } })).status).toBe("CANCELLED");
});
