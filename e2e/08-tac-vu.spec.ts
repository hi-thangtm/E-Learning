import { expect, test, type Page } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { createCourse, daysFromNow, db, enroll, uid, userByCode } from "./helpers/db";
import { runDailyJob } from "./helpers/job";

/**
 * Kịch bản 8 — Tác vụ hằng ngày (POST /api/jobs/daily với CRON_SECRET của .env.test):
 * nhắc sắp hạn theo DUE_SOON_DAYS (đổi trong Cài đặt), nhắc quá hạn theo chu kỳ OVERDUE_REMIND_INTERVAL_DAYS,
 * chứng nhận sắp hết hạn (CERT_EXPIRING_DAYS mặc định 30), chạy 2 lần không gửi trùng.
 * Tác vụ chạy trên toàn database → chỉ kiểm thông báo của lượt học / chứng nhận do test này tạo.
 */

const KEYS = ["DUE_SOON_DAYS", "OVERDUE_REMIND_INTERVAL_DAYS"] as const;

/** Admin tập đoàn đổi cài đặt nhóm Nhắc nhở trên /system/settings */
async function saveReminderSettings(page: Page, values: Record<(typeof KEYS)[number], number>) {
  await gotoReady(page, "/system/settings");
  for (const [key, value] of Object.entries(values)) await page.locator(`#${key}`).fill(String(value));
  await page.locator("form", { has: page.locator("#DUE_SOON_DAYS") }).getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  for (const [key, value] of Object.entries(values)) {
    await expect.poll(async () => (await db.systemSetting.findUnique({ where: { key } }))?.value).toBe(value);
  }
}

test("nhắc sắp hạn / quá hạn theo Cài đặt, chứng nhận sắp hết hạn, chạy 2 lần không gửi trùng", async ({ browser }) => {
  const before = await db.systemSetting.findMany({ where: { key: { in: [...KEYS] } } });
  try {
    // Mặc định 3 ngày / chu kỳ 7 ngày → đổi thành 5 / 2 để chứng minh tác vụ đọc Cài đặt
    const ga = await pageAs(browser, "TEST-GA");
    await saveReminderSettings(ga, { DUE_SOON_DAYS: 5, OVERDUE_REMIND_INTERVAL_DAYS: 2 });

    const { course } = await createCourse({ title: `Khoá tác vụ ${uid()}` });
    const { course: certCourse } = await createCourse({ title: `Khoá chứng nhận ${uid()}`, hasCertificate: true, certificateValidMonths: 12 });
    const dueIn4 = await enroll("TEST-LN1", course.id, { dueDate: daysFromNow(4) }); // ≤ 5 ngày → nhắc (mặc định 3 thì không)
    const dueIn7 = await enroll("TEST-LN2", course.id, { dueDate: daysFromNow(7) }); // > 5 ngày → không nhắc
    const overdue1 = await enroll("TEST-LN3", course.id, { dueDate: daysFromNow(-1) }); // quá hạn ngày đầu → chu kỳ w0
    const overdue5 = await enroll("TEST-LN4", course.id, { dueDate: daysFromNow(-5) }); // quá 5 ngày, chu kỳ 2 → w2
    const done = await enroll("TEST-LN5", course.id, { status: "COMPLETED", progressPercent: 100, completedAt: new Date(), dueDate: daysFromNow(-3) }); // đã xong → không nhắc

    const holder = await userByCode("TEST-LN5");
    const certSoon = await db.certificate.create({
      data: { code: `CERT-2026-S${uid()}`, userId: holder.id, courseId: certCourse.id, courseVersion: 1, recipientName: holder.fullName, courseTitle: certCourse.title, expiresAt: daysFromNow(20) },
    });
    const certLater = await db.certificate.create({
      data: { code: `CERT-2026-L${uid()}`, userId: holder.id, courseId: null, courseVersion: 1, recipientName: holder.fullName, courseTitle: certCourse.title, expiresAt: daysFromNow(40) },
    });

    const vnDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);
    const keysOf = async (prefix: string) =>
      (await db.notification.findMany({ where: { dedupeKey: { startsWith: prefix } }, select: { dedupeKey: true } })).map((n) => n.dedupeKey);
    const snapshot = async () => ({
      dueIn4: await keysOf(`due_soon:${dueIn4.id}:`),
      dueIn7: await keysOf(`due_soon:${dueIn7.id}:`),
      overdue1: await keysOf(`overdue:${overdue1.id}:`),
      overdue5: await keysOf(`overdue:${overdue5.id}:`),
      done: [...(await keysOf(`due_soon:${done.id}:`)), ...(await keysOf(`overdue:${done.id}:`))],
      certSoon: await keysOf(`cert_expiring:${certSoon.id}`),
      certLater: await keysOf(`cert_expiring:${certLater.id}`),
    });

    const first = await runDailyJob();
    expect(first.ok).toBe(true);
    const s1 = await snapshot();
    expect(s1).toEqual({
      dueIn4: [`due_soon:${dueIn4.id}:${vnDay(dueIn4.dueDate!)}`],
      dueIn7: [],
      overdue1: [`overdue:${overdue1.id}:${vnDay(overdue1.dueDate!)}:w0`],
      overdue5: [`overdue:${overdue5.id}:${vnDay(overdue5.dueDate!)}:w2`],
      done: [],
      certSoon: [`cert_expiring:${certSoon.id}`],
      certLater: [],
    });
    // Đúng loại thông báo + đúng người nhận
    const dueNote = await db.notification.findFirstOrThrow({ where: { dedupeKey: s1.dueIn4[0]! } });
    expect([dueNote.type, dueNote.userId]).toEqual(["DUE_SOON", dueIn4.userId]);
    const overdueNote = await db.notification.findFirstOrThrow({ where: { dedupeKey: s1.overdue5[0]! } });
    expect([overdueNote.type, overdueNote.userId]).toEqual(["OVERDUE", overdue5.userId]);
    expect(overdueNote.title).toContain("quá hạn 5 ngày");
    const certNote = await db.notification.findFirstOrThrow({ where: { dedupeKey: s1.certSoon[0]! } });
    expect([certNote.type, certNote.userId]).toEqual(["CERTIFICATE_EXPIRING", holder.id]);

    // Chạy lần 2 trong ngày → không thêm thông báo nào
    const second = await runDailyJob();
    expect(second.ok).toBe(true);
    expect(await snapshot()).toEqual(s1);

    // Học viên thấy thông báo trên trang Thông báo
    const learner = await pageAs(browser, "TEST-LN1");
    await learner.goto("/notifications");
    await expect(learner.getByText(`Khoá “${course.title}” sẽ đến hạn`)).toBeVisible();
  } finally {
    // Trả cài đặt về như trước test
    await db.systemSetting.deleteMany({ where: { key: { in: [...KEYS] } } });
    for (const s of before) await db.systemSetting.create({ data: { key: s.key, value: s.value ?? 0 } });
  }
});
