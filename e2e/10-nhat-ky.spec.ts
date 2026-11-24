import { expect, test } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { companyByCode, createCourse, daysFromNow, db, uid, userByCode } from "./helpers/db";
import { pickDate } from "./helpers/date";

/**
 * Kịch bản 10 — Nhật ký thao tác: mỗi thao tác quản trị làm qua giao diện có đúng 1 dòng audit_logs
 * đúng người làm (actor), mã thao tác (action), đối tượng (entityType + entityId) và công ty; trang Nhật ký hiển thị đúng phạm vi.
 * Tự làm thao tác trong file này (không dựa vào file khác) → chạy riêng được.
 */

type Expected = { actor: string; action: string; entityType: string; entityId: string | null; companyId: string };

/** Đúng 1 dòng audit khớp actor / action / entity / công ty */
async function expectAudit(e: Expected) {
  const actor = await userByCode(e.actor);
  await expect
    .poll(() => db.auditLog.count({ where: { actorId: actor.id, action: e.action, entityType: e.entityType, entityId: e.entityId, companyId: e.companyId } }), {
      message: `${e.action} của ${e.actor} trên ${e.entityType}:${e.entityId}`,
    })
    .toBe(1);
}

test("tổ chức: tạo công ty, phòng ban, người dùng, đặt lại mật khẩu, khoá — đúng người làm / thao tác / đối tượng", async ({ browser }) => {
  const u = uid();
  const cty1 = await companyByCode("CTY1");

  // Admin tập đoàn tạo công ty con
  const ga = await pageAs(browser, "TEST-GA");
  const companyCode = `L${u}`;
  await gotoReady(ga, "/system/companies");
  await ga.getByRole("button", { name: "Thêm công ty con" }).click();
  const companyDialog = ga.getByRole("dialog");
  await companyDialog.locator("#code").fill(companyCode);
  await companyDialog.locator("#name").fill(`Công ty nhật ký ${u}`);
  await companyDialog.getByRole("button", { name: "Thêm công ty con", exact: true }).click();
  await expect(companyDialog).toBeHidden();
  const company = await companyByCode(companyCode);
  await expectAudit({ actor: "TEST-GA", action: "COMPANY_CREATED", entityType: "Company", entityId: company.id, companyId: company.id });

  // Admin công ty tạo phòng ban
  const ca = await pageAs(browser, "TEST-CA1");
  await gotoReady(ca, "/org/departments");
  await ca.getByRole("button", { name: "Thêm phòng ban" }).first().click();
  const deptDialog = ca.getByRole("dialog");
  await deptDialog.locator("#code").fill(`NK${u}`);
  await deptDialog.locator("#name").fill(`Phòng nhật ký ${u}`);
  await deptDialog.getByRole("button", { name: "Thêm phòng ban", exact: true }).click();
  await expect(deptDialog).toBeHidden();
  const dept = await db.department.findUniqueOrThrow({ where: { companyId_code: { companyId: cty1.id, code: `NK${u}` } } });
  await expectAudit({ actor: "TEST-CA1", action: "DEPARTMENT_CREATED", entityType: "Department", entityId: dept.id, companyId: cty1.id });

  // Admin công ty tạo người dùng
  const userCode = `E2E-NK-${u}`;
  await gotoReady(ca, "/org/users");
  await ca.getByRole("button", { name: "Thêm người dùng" }).first().click();
  const userDialog = ca.getByRole("dialog");
  await userDialog.locator("#employeeCode").fill(userCode);
  await userDialog.locator("#fullName").fill(`Người nhật ký ${u}`);
  const password = userDialog.locator("#password");
  if (await password.isVisible()) await password.fill("MatKhauTam1");
  await userDialog.getByRole("button", { name: "Thêm người dùng", exact: true }).click();
  await expect.poll(async () => (await db.user.findUnique({ where: { employeeCode: userCode } }))?.id).toBeTruthy();
  const target = await userByCode(userCode);
  await expectAudit({ actor: "TEST-CA1", action: "USER_CREATED", entityType: "User", entityId: target.id, companyId: cty1.id });

  // Đặt lại mật khẩu, rồi khoá
  await gotoReady(ca, `/org/users/${target.id}`);
  await ca.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await ca.getByRole("dialog").getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await expectAudit({ actor: "TEST-CA1", action: "USER_PASSWORD_RESET", entityType: "User", entityId: target.id, companyId: cty1.id });
  await gotoReady(ca, `/org/users/${target.id}`);
  await ca.getByRole("button", { name: "Khoá tài khoản", exact: true }).click();
  await ca.getByRole("alertdialog").getByRole("button", { name: "Khoá", exact: true }).click();
  await expectAudit({ actor: "TEST-CA1", action: "USER_LOCKED", entityType: "User", entityId: target.id, companyId: cty1.id });

  // Trang Nhật ký: Admin CTY1 thấy dòng khoá tài khoản (nhãn tiếng Việt + đối tượng); Admin CTY2 không thấy thao tác của CTY1
  await gotoReady(ca, "/system/audit-logs?q=TEST-CA1&pageSize=50");
  const row = ca.locator("tbody tr", { hasText: `(${userCode})` }).filter({ hasText: "Khoá tài khoản" });
  await expect(row).toHaveCount(1);
  const other = await pageAs(browser, "TEST-CA2");
  await gotoReady(other, "/system/audit-logs?q=TEST-CA1&pageSize=50");
  await expect(other.getByText(`(${userCode})`)).toHaveCount(0);
});

test("khoá học & giao khoá: tạo khoá, giao thủ công, gia hạn, huỷ giao — đúng người làm / thao tác / đối tượng", async ({ browser }) => {
  const cty1 = await companyByCode("CTY1");

  // Biên soạn tạo khoá
  const ce = await pageAs(browser, "TEST-CE1");
  const courseCode = `NK-${uid()}`;
  await gotoReady(ce, "/content/courses");
  await ce.getByRole("button", { name: "Tạo khoá học" }).first().click();
  const dialog = ce.getByRole("dialog");
  await dialog.locator("#code").fill(courseCode);
  await dialog.locator("#title").fill(`Khoá nhật ký ${courseCode}`);
  await dialog.getByRole("button", { name: "Tạo và soạn" }).click();
  await expect.poll(async () => (await db.course.findUnique({ where: { code: courseCode } }))?.id).toBeTruthy();
  const created = await db.course.findUniqueOrThrow({ where: { code: courseCode } });
  await expectAudit({ actor: "TEST-CE1", action: "COURSE_CREATED", entityType: "Course", entityId: created.id, companyId: cty1.id });

  // Admin công ty giao thủ công → gia hạn → huỷ giao
  const { course } = await createCourse({ title: `Khoá giao nhật ký ${uid()}` });
  const learner = await userByCode("TEST-LN2");
  const ca = await pageAs(browser, "TEST-CA1");
  await gotoReady(ca, "/assign/manual/new");
  await ca.getByLabel(/Tìm khoá học/).fill(course.code);
  await ca.getByRole("button", { name: new RegExp(course.code) }).click();
  await ca.getByRole("radio", { name: /Thủ công/ }).or(ca.locator('[title="Thủ công — chọn từng người"]')).first().click();
  await ca.getByLabel("Tìm học viên").fill("TEST-LN2");
  await ca.getByRole("checkbox", { name: `Chọn ${learner.fullName}` }).check();
  await ca.getByRole("button", { name: "Tiếp: đặt hạn" }).click();
  await ca.getByRole("button", { name: /Xác nhận giao \(1 thay đổi\)/ }).click();
  await expect(ca).toHaveURL(/\/assign\/manual(\?|$)/);
  await expectAudit({ actor: "TEST-CA1", action: "ENROLLMENTS_ASSIGNED", entityType: "Course", entityId: course.id, companyId: cty1.id });
  const enrollment = await db.enrollment.findFirstOrThrow({ where: { courseId: course.id, userId: learner.id } });

  await gotoReady(ca, `/assign/manual?course=${course.id}`);
  const menu = ca.getByRole("button", { name: `Thao tác cho lượt giao của ${learner.fullName} (TEST-LN2)` });
  await menu.click();
  await ca.getByRole("menuitem", { name: "Gia hạn" }).click();
  await pickDate(ca, ca.getByRole("dialog").locator("#extend-date"), daysFromNow(45).toISOString().slice(0, 10));
  await ca.getByRole("dialog").getByRole("button", { name: "Gia hạn", exact: true }).click();
  await expectAudit({ actor: "TEST-CA1", action: "ENROLLMENT_EXTENDED", entityType: "Enrollment", entityId: enrollment.id, companyId: cty1.id });

  await menu.click();
  await ca.getByRole("menuitem", { name: /Huỷ giao/ }).click();
  await ca.getByRole("alertdialog").getByRole("button", { name: "Huỷ giao" }).click();
  await expectAudit({ actor: "TEST-CA1", action: "ENROLLMENT_CANCELLED", entityType: "Enrollment", entityId: enrollment.id, companyId: cty1.id });
});

test("trưởng phòng gửi nhắc nhở → nhật ký ghi đúng người làm và người được nhắc", async ({ browser }) => {
  const cty1 = await companyByCode("CTY1");
  const learner = await userByCode("TEST-LN3");
  const { course } = await createCourse({ title: `Khoá nhắc nhật ký ${uid()}` });
  await db.enrollment.create({ data: { userId: learner.id, courseId: course.id, source: "ASSIGNED", dueDate: daysFromNow(-1) } });
  // Lần nhắc trong ngày đầu tiên của người này (kịch bản 7 dùng TEST-LN4) — xoá nhắc nhở hôm nay nếu chạy lại
  await db.notification.deleteMany({ where: { userId: learner.id, type: "REMINDER" } });
  const before = await db.auditLog.count({ where: { action: "TEAM_REMINDER_SENT", entityId: learner.id } });

  const page = await pageAs(browser, "TEST-MG1");
  await gotoReady(page, "/team/members?q=TEST-LN3");
  await page.getByRole("checkbox", { name: `Chọn ${learner.fullName}` }).check();
  await page.getByRole("button", { name: "Gửi nhắc nhở", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Tất cả khoá chưa hoàn thành").click();
  await dialog.getByRole("button", { name: /Gửi nhắc nhở/ }).click();
  await expect(dialog).toBeHidden();

  const mg = await userByCode("TEST-MG1");
  await expect.poll(() => db.auditLog.count({ where: { actorId: mg.id, action: "TEAM_REMINDER_SENT", entityType: "User", entityId: learner.id, companyId: cty1.id } })).toBe(before + 1);
});
