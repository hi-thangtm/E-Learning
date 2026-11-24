import { expect, test, type Page } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { createCourse, createLearner, daysFromNow, db, enroll, uid, userByCode } from "./helpers/db";
import { readXlsx } from "./helpers/files";

/**
 * Kịch bản 7 — Quản lý (TEST-MG1, trưởng phòng KD có phòng con KD-N1): đúng phạm vi đội, quá hạn, nhắc nhở (lần 2 trong ngày bị bỏ qua),
 * khoá tự đăng ký không kéo tỷ lệ, Báo cáo tab Theo khoá học khớp DB, xuất Excel đọc lại bằng exceljs.
 */

/** Đọc bảng đầu tiên trên trang: mỗi dòng = { tiêu đề cột → chữ trong ô } */
async function readTable(page: Page): Promise<Record<string, string>[]> {
  const table = page.locator("table").first();
  await expect(table).toBeVisible();
  const headers = (await table.locator("thead th").allInnerTexts()).map((h) => h.replace(/\s+/g, " ").trim());
  const rows = await table.locator("tbody tr").all();
  const out: Record<string, string>[] = [];
  for (const r of rows) {
    const cells = (await r.locator("td").allInnerTexts()).map((c) => c.replace(/\s+/g, " ").trim());
    out.push(Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])));
  }
  return out;
}
/** Giá trị ô theo tên cột (bỏ qua hoa / thường — tiêu đề bảng Nhân viên hiển thị CHỮ IN HOA bằng CSS) */
const col = (row: Record<string, string>, name: string) =>
  row[Object.keys(row).find((k) => k.toLocaleLowerCase("vi").startsWith(name.toLocaleLowerCase("vi"))) ?? ""] ?? "";

test("trưởng phòng thấy đúng người: gồm phòng con, không có người ngoài đội", async ({ browser }) => {
  const page = await pageAs(browser, "TEST-MG1");
  // Lọc theo mã NV (đội đông lên sau mỗi lượt chạy vì kịch bản 1, 3 thêm người vào phòng KD → không dựa vào trang 1)
  const listed = async (code: string) => {
    await gotoReady(page, `/team/members?q=${code}`);
    await expect(page.getByText(/Đang tải/)).toHaveCount(0); // chờ hết khung loading (dữ liệu stream sau)
    return page.locator("body").innerText();
  };
  for (const code of ["TEST-LN1", "TEST-LN2", "TEST-LN3", "TEST-LN4", "TEST-LN5"]) {
    const u = await userByCode(code);
    expect(await listed(code), `${code} phải có trong đội`).toContain(u.fullName);
  }
  expect(await listed("TEST-OUT")).not.toContain((await userByCode("TEST-OUT")).fullName);
  expect(await listed("TEST-CTY2-LN")).not.toContain((await userByCode("TEST-CTY2-LN")).fullName);
});

test("lượt quá hạn hiện ở bộ lọc Quá hạn; khoá tự đăng ký không làm thay đổi số được giao / tỷ lệ", async ({ browser }) => {
  const learner = await createLearner();
  const page = await pageAs(browser, "TEST-MG1");
  const rowOf = async (url: string) => (await readTable((await page.goto(url), page))).find((r) => Object.values(r).some((v) => v.includes(learner.fullName)));

  // Quá hạn
  const { course } = await createCourse({ title: `Khoá quá hạn ${uid()}` });
  await db.enrollment.create({ data: { userId: learner.id, courseId: course.id, source: "ASSIGNED", dueDate: daysFromNow(-3) } });
  const overdueRow = await rowOf(`/team/members?overdue=1&q=${learner.employeeCode}`);
  expect(overdueRow, "học viên phải có trong lọc Quá hạn").toBeTruthy();
  expect(Number(col(overdueRow!, "Quá hạn"))).toBe(1);

  // Tự đăng ký không tính vào Được giao / Tỷ lệ
  const before = await rowOf(`/team/members?q=${learner.employeeCode}`);
  const { course: self } = await createCourse({ title: `Khoá tự học ${uid()}`, allowSelfEnroll: true });
  await db.enrollment.create({ data: { userId: learner.id, courseId: self.id, source: "SELF", dueDate: null } });
  const after = await rowOf(`/team/members?q=${learner.employeeCode}`);
  expect(col(before!, "Được giao")).toBe("1");
  expect(col(after!, "Được giao")).toBe(col(before!, "Được giao"));
  expect(col(after!, "Tỷ lệ")).toBe(col(before!, "Tỷ lệ"));
});

test("nhắc nhở: người nhận có thông báo, gửi lần 2 trong ngày bị bỏ qua", async ({ browser }) => {
  const learner = await createLearner({ department: "KD-N1" });
  const { course } = await createCourse({ title: `Khoá nhắc nhở ${uid()}` });
  await db.enrollment.create({ data: { userId: learner.id, courseId: course.id, source: "ASSIGNED", dueDate: daysFromNow(-2) } });
  const count = () => db.notification.count({ where: { userId: learner.id, type: "REMINDER" } });
  const page = await pageAs(browser, "TEST-MG1");

  const send = async () => {
    await gotoReady(page, `/team/members?q=${learner.employeeCode}`);
    await page.getByRole("checkbox", { name: `Chọn ${learner.fullName}` }).check();
    await page.getByRole("button", { name: "Gửi nhắc nhở", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByText("Tất cả khoá chưa hoàn thành").click();
    const button = dialog.getByRole("button", { name: /Gửi nhắc nhở/ });
    await expect(button).toBeEnabled();
    await button.click();
    await expect(dialog).toBeHidden();
  };
  await send();
  await expect.poll(count).toBe(1);
  await send();
  await page.waitForTimeout(1000);
  expect(await count(), "lần 2 trong ngày không gửi trùng").toBe(1);
});

test("Báo cáo tab Theo khoá học khớp số đếm trong database và file Excel xuất ra", async ({ browser }) => {
  const title = `Khoá báo cáo ${uid()}`;
  const { course } = await createCourse({ title });
  await enroll("TEST-LN1", course.id, { status: "COMPLETED", progressPercent: 100, completedAt: new Date(), completedVersion: 1, acknowledgedVersion: 1 });
  await enroll("TEST-LN3", course.id); // phòng con — tính
  await enroll("TEST-LN5", course.id, { dueDate: daysFromNow(-1) }); // quá hạn
  await enroll("TEST-OUT", course.id, { status: "COMPLETED", progressPercent: 100, completedAt: new Date() }); // ngoài đội — KHÔNG tính

  // Số đếm từ DB theo phạm vi đội (người trong KD + KD-N1)
  const teamCodes = (await db.user.findMany({ where: { status: "ACTIVE", department: { OR: [{ code: "KD" }, { code: "KD-N1" }], company: { code: "CTY1" } } }, select: { id: true } })).map((u) => u.id);
  const dbAssigned = await db.enrollment.count({ where: { courseId: course.id, userId: { in: teamCodes }, status: { not: "CANCELLED" }, source: { in: ["RULE", "ASSIGNED"] } } });
  const dbCompleted = await db.enrollment.count({ where: { courseId: course.id, userId: { in: teamCodes }, status: "COMPLETED", source: { in: ["RULE", "ASSIGNED"] } } });
  expect([dbAssigned, dbCompleted]).toEqual([3, 1]);

  const page = await pageAs(browser, "TEST-MG1");
  await page.goto(`/reports?tab=courses&q=${course.code}`); // lọc theo mã khoá — không phụ thuộc phân trang khi dữ liệu nhiều lên
  const row = (await readTable(page)).find((r) => Object.values(r).some((v) => v.includes(title)));
  expect(row, "khoá phải có trong báo cáo").toBeTruthy();
  expect(Number(col(row!, "Được giao"))).toBe(dbAssigned);
  expect(Number(col(row!, "Hoàn thành"))).toBe(dbCompleted);
  expect(Number(col(row!, "Quá hạn"))).toBe(1);

  // Xuất Excel → đọc lại bằng exceljs
  const res = await page.request.get("/reports/export?tab=courses");
  expect(res.status()).toBe(200);
  const sheets = await readXlsx(Buffer.from(await res.body()));
  const data = [...sheets.values()].find((rows) => rows.some((r) => r.includes(title)));
  expect(data, "file Excel phải có dòng của khoá").toBeTruthy();
  const header = data![0];
  const line = data!.find((r) => r.includes(title))!;
  expect(Number(line[header.indexOf("Được giao")])).toBe(dbAssigned);
  expect(Number(line[header.indexOf("Hoàn thành")])).toBe(dbCompleted);

  // Xuất toàn bộ: sheet Thông tin + 5 sheet báo cáo + Định nghĩa chỉ số
  const all = await readXlsx(Buffer.from(await (await page.request.get("/reports/export?tab=all")).body()));
  expect(all.size).toBe(7);
  expect([...all.keys()][0]).toBe("Thông tin");
});

test("Ngày HT TB không hiện “-0” khi thời gian hoàn thành gần như bằng 0 (lỗi #1 docs/test-report.md)", async ({ browser }) => {
  const title = `Khoá hoàn thành ngay ${uid()}`;
  const { course } = await createCourse({ title });
  const now = Date.now();
  // Hoàn thành sớm hơn lúc giao vài giây (dữ liệu nhập / đồng hồ lệch) → trung bình là số âm rất nhỏ
  await enroll("TEST-LN1", course.id, { createdAt: new Date(now), status: "COMPLETED", progressPercent: 100, completedAt: new Date(now - 5_000), completedVersion: 1, acknowledgedVersion: 1 });

  const page = await pageAs(browser, "TEST-MG1");
  await page.goto(`/reports?tab=courses&q=${course.code}`);
  const row = (await readTable(page)).find((r) => Object.values(r).some((v) => v.includes(title)));
  expect(row, "khoá phải có trong báo cáo").toBeTruthy();
  expect(col(row!, "Ngày HT TB")).toBe("0");
});
