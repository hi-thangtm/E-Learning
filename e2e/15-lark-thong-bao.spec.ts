import { expect, test } from "@playwright/test";
import { MOCK_LARK_PORT } from "../scripts/test/common";
import { gotoReady, pageAs } from "./helpers/auth";
import { createCourse, createLearner, db, uid, userByCode } from "./helpers/db";

/**
 * Kịch bản 15 — Gửi thông báo qua Lark (Việc L2) với Lark GIẢ LẬP (e2e/mock-lark):
 * bật trên giao diện → giao khoá → người đã liên kết Lark nhận thẻ có nút mở; chưa liên kết → bỏ qua; loại tắt / tạo trước khi bật → không gửi;
 * lỗi tạm → thử lại; người ngoài phạm vi app → lỗi + “Gửi lại tin lỗi”; gửi hàng loạt mỗi người đúng 1 tin; “Gửi thử cho tôi”.
 * Bộ gửi nền chạy trong app mỗi 10 giây + đánh thức ngay khi có thông báo mới.
 */

const MOCK = `http://localhost:${MOCK_LARK_PORT}`;
type SentCard = { receive_id: string; msg_type: string; content: { header?: { title?: { content?: string } }; elements?: { tag: string; text?: { content?: string }; actions?: { url?: string }[] }[] } };

const messagesTo = async (larkUserId: string): Promise<SentCard[]> =>
  ((await (await fetch(`${MOCK}/__mock/messages`)).json()) as SentCard[]).filter((m) => m.receive_id === larkUserId);
const mock = (path: string, body: object) => fetch(`${MOCK}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const notificationOf = (userId: string, type: string) => db.notification.findFirstOrThrow({ where: { userId, type }, orderBy: { createdAt: "desc" } });

/** Học viên mới đã liên kết Lark (larkUserId riêng) */
async function linkedLearner(name?: string) {
  const u = await createLearner(name ? { fullName: name } : {});
  return db.user.update({ where: { id: u.id }, data: { larkUserId: `lark_${uid()}` } });
}

/** Thông báo chờ gửi Lark tạo thẳng trong DB (như notify() đánh dấu) */
async function queued(userId: string, type = "COURSE_ASSIGNED", createdAt = new Date()) {
  return db.notification.create({
    data: { userId, type, title: `Thông báo kiểm thử ${uid()}`, link: "/my-courses", createdAt, larkStatus: "PENDING", larkNextAttemptAt: new Date() },
  });
}

test.describe.serial("Gửi thông báo qua Lark", () => {
  test.beforeAll(async () => {
    await mock("/__mock/messages/reset", {});
  });
  test.afterAll(async () => {
    // Tắt lại để các lượt chạy sau / kịch bản khác không bị ảnh hưởng
    await db.systemSetting.deleteMany({ where: { key: "LARK_NOTIFY" } });
    await db.user.update({ where: { employeeCode: "TEST-GA" }, data: { larkUserId: null } });
    // Gỡ liên kết các học viên thử: larkUserId giả không có trên Lark giả lập → đồng bộ danh bạ (99-lark) sẽ coi là đã nghỉ
    await db.user.updateMany({ where: { larkUserId: { startsWith: "lark_" } }, data: { larkUserId: null } });
  });

  test("Admin bật gửi qua Lark; thông báo tạo trước khi bật không gửi bù", async ({ browser }) => {
    const before = await linkedLearner();
    const old = await queued(before.id, "COURSE_ASSIGNED", new Date(Date.now() - 60_000));

    const page = await pageAs(browser, "TEST-GA");
    await gotoReady(page, "/system/lark");
    await page.getByRole("switch", { name: "Bật gửi thông báo qua Lark" }).click();
    await expect(page.getByRole("switch", { name: "Gửi qua Lark: Được giao khoá học" })).toBeChecked();
    await expect(page.getByRole("switch", { name: "Gửi qua Lark: Hoàn thành lộ trình" })).not.toBeChecked();
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Đã lưu — thông báo mới sẽ được gửi qua Lark.")).toBeVisible();
    const setting = await db.systemSetting.findUniqueOrThrow({ where: { key: "LARK_NOTIFY" } });
    expect((setting.value as { enabled: boolean }).enabled).toBe(true);

    await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: old.id } })).larkStatus, { timeout: 25_000 }).toBe("SKIPPED");
    expect(await messagesTo(before.larkUserId!)).toHaveLength(0);
    expect(await db.auditLog.count({ where: { action: "LARK_NOTIFY_SETTINGS_UPDATED" } })).toBeGreaterThan(0);
  });

  test("giao khoá → người đã liên kết Lark nhận thẻ có nút mở khoá; người chưa liên kết bị bỏ qua", async ({ browser }) => {
    const linked = await linkedLearner(`Học viên Lark ${uid()}`);
    const unlinked = await createLearner({ fullName: `Học viên không Lark ${uid()}` });
    const { course } = await createCourse({ title: `Khoá gửi Lark ${uid()}` });

    const page = await pageAs(browser, "TEST-CA1");
    await gotoReady(page, "/assign/manual/new");
    await page.getByLabel(/Tìm khoá học/).fill(course.code);
    await page.getByRole("button", { name: new RegExp(course.code) }).click();
    await page.getByRole("radio", { name: /Thủ công/ }).or(page.locator('[title="Thủ công — chọn từng người"]')).first().click();
    for (const u of [linked, unlinked]) {
      await page.getByLabel("Tìm học viên").fill(u.employeeCode);
      await page.getByRole("checkbox", { name: `Chọn ${u.fullName}` }).check();
    }
    await page.getByRole("button", { name: "Tiếp: đặt hạn" }).click();
    await page.getByRole("button", { name: /Xác nhận giao \(2 thay đổi\)/ }).click();
    await expect(page).toHaveURL(/\/assign\/manual(\?|$)/);

    // Gửi trong vài giây (bộ gửi được đánh thức ngay khi tạo thông báo)
    await expect.poll(async () => (await messagesTo(linked.larkUserId!)).length, { timeout: 15_000 }).toBe(1);
    const [card] = await messagesTo(linked.larkUserId!);
    expect(card.msg_type).toBe("interactive");
    expect(card.content.header?.title?.content).toBe("Được giao khoá học");
    expect(JSON.stringify(card.content)).toContain(course.title);
    const sent = await notificationOf(linked.id, "COURSE_ASSIGNED");
    // Nút “Mở trong E-Learning” = APP_URL + đúng link của thông báo trong chuông
    const button = card.content.elements?.find((e) => e.tag === "action")?.actions?.[0];
    expect(button?.url).toBe(`http://localhost:3200${sent.link}`);
    expect([sent.larkStatus, sent.sentToLarkAt !== null]).toEqual(["SENT", true]);
    await expect.poll(async () => (await notificationOf(unlinked.id, "COURSE_ASSIGNED")).larkStatus, { timeout: 15_000 }).toBe("SKIPPED");
    expect((await notificationOf(unlinked.id, "COURSE_ASSIGNED")).larkError).toContain("chưa liên kết Lark");
  });

  test("loại thông báo đang tắt → không gửi", async () => {
    const u = await linkedLearner();
    const n = await queued(u.id, "PATH_COMPLETED");
    await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkStatus, { timeout: 25_000 }).toBe("SKIPPED");
    expect(await messagesTo(u.larkUserId!)).toHaveLength(0);
  });

  test("Lark lỗi tạm 2 lần → tự thử lại rồi gửi được, đúng 1 tin", async () => {
    const u = await linkedLearner();
    await mock("/__mock/message-fail", { count: 2, status: 500 });
    const n = await queued(u.id);
    for (let attempt = 1; attempt <= 2; attempt++) {
      await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkAttempts, { timeout: 25_000 }).toBe(attempt);
      const row = await db.notification.findUniqueOrThrow({ where: { id: n.id } });
      expect(row.larkStatus).toBe("PENDING");
      expect(row.larkNextAttemptAt!.getTime()).toBeGreaterThan(Date.now()); // chờ thử lại (1 → 5 phút)
      // Rút ngắn thời gian chờ cho kiểm thử
      await db.notification.update({ where: { id: n.id }, data: { larkNextAttemptAt: new Date() } });
    }
    await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkStatus, { timeout: 25_000 }).toBe("SENT");
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkAttempts).toBe(3);
    expect(await messagesTo(u.larkUserId!)).toHaveLength(1);
  });

  test("người ngoài phạm vi app → lỗi kèm lý do trên trang; “Gửi lại tin lỗi” sau khi sửa → gửi được", async ({ browser }) => {
    const u = await linkedLearner(`Học viên ngoài phạm vi ${uid()}`);
    await mock("/__mock/blocked-users", { userIds: [u.larkUserId] });
    const n = await queued(u.id);
    await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkStatus, { timeout: 25_000 }).toBe("FAILED");
    expect((await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkError).toContain("phạm vi sử dụng");

    const page = await pageAs(browser, "TEST-GA");
    await gotoReady(page, "/system/lark");
    await expect(page.getByText(u.fullName)).toBeVisible();
    await mock("/__mock/blocked-users", { userIds: [] });
    await page.getByRole("button", { name: "Gửi lại tin lỗi" }).click();
    await expect.poll(async () => (await db.notification.findUniqueOrThrow({ where: { id: n.id } })).larkStatus, { timeout: 25_000 }).toBe("SENT");
    expect(await messagesTo(u.larkUserId!)).toHaveLength(1);
  });

  test("gửi hàng loạt 30 người → mỗi người đúng 1 tin", async () => {
    const users = await Promise.all(Array.from({ length: 30 }, () => linkedLearner()));
    await Promise.all(users.map((u) => queued(u.id, "REMINDER")));
    for (const u of users) await expect.poll(async () => (await messagesTo(u.larkUserId!)).length, { timeout: 40_000 }).toBe(1);
    expect(await db.notification.count({ where: { userId: { in: users.map((u) => u.id) }, larkStatus: "SENT" } })).toBe(30);
  });

  test("“Gửi thử cho tôi”: chưa liên kết → báo rõ; đã liên kết → nhận thẻ thử", async ({ browser }) => {
    const ga = await userByCode("TEST-GA");
    const page = await pageAs(browser, "TEST-GA");
    await gotoReady(page, "/system/lark");
    await page.getByRole("button", { name: "Gửi thử cho tôi" }).click();
    await expect(page.getByText(/chưa liên kết Lark/).first()).toBeVisible();

    const larkId = `lark_ga_${uid()}`;
    await db.user.update({ where: { id: ga.id }, data: { larkUserId: larkId } });
    await page.getByRole("button", { name: "Gửi thử cho tôi" }).click();
    await expect(page.getByText("Đã gửi tin nhắn thử — kiểm tra Lark của bạn.")).toBeVisible();
    expect(await messagesTo(larkId)).toHaveLength(1);
  });
});
