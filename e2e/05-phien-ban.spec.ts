import { expect, test, type Page } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { createCourse, db, enroll, uid, userByCode } from "./helpers/db";

/** Kịch bản 5 — Phiên bản: MINOR → thông báo → xác nhận; MAJOR: Biên soạn đề xuất → Admin công ty duyệt → học lại, chứng nhận cũ giữ nguyên (Quy tắc 2). */

/** Học viên đã hoàn thành phiên bản 1 (kèm tiến độ bài + chứng nhận nếu khoá có) */
async function completedV1(userCode: string, courseId: string, lessonIds: string[], withCertificate = false) {
  const user = await userByCode(userCode);
  const done = new Date(Date.now() - 5 * 86_400_000);
  await enroll(userCode, courseId, { status: "COMPLETED", progressPercent: 100, startedAt: done, completedAt: done, completedVersion: 1, acknowledgedVersion: 1, acknowledgedAt: done });
  for (const lessonId of lessonIds) await db.lessonProgress.create({ data: { userId: user.id, lessonId, isCompleted: true, completedAt: done } });
  if (withCertificate) {
    await db.certificate.create({ data: { code: `CERT-2026-E${uid()}`, userId: user.id, courseId, courseVersion: 1, recipientName: user.fullName, courseTitle: "Khoá phiên bản", issuedAt: done } });
  }
  return user;
}

async function openUpdateDialog(page: Page, courseId: string, kind: RegExp, summary: string) {
  await gotoReady(page, `/content/courses/${courseId}`);
  await page.getByRole("button", { name: "Phát hành bản cập nhật" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: kind }).click();
  await dialog.getByRole("button", { name: "Tiếp tục" }).click();
  await dialog.locator("#version-summary [contenteditable]").click();
  await page.keyboard.type(summary);
  await dialog.getByRole("button", { name: "Tiếp tục" }).click();
  return dialog;
}

test("MINOR: học viên đã xong nhận thông báo, đọc và xác nhận → acknowledgedVersion cập nhật", async ({ browser }) => {
  const { course, lessons } = await createCourse({ title: `Khoá MINOR ${uid()}` });
  const learner = await completedV1("TEST-LN1", course.id, lessons.map((l) => l.id));

  const ce = await pageAs(browser, "TEST-CE1");
  const dialog = await openUpdateDialog(ce, course.id, /^MINOR/, "Bổ sung bước kiểm tra thiết bị trước ca làm.");
  await dialog.getByRole("button", { name: "Phát hành", exact: true }).click();
  await expect.poll(async () => (await db.course.findUniqueOrThrow({ where: { id: course.id } })).currentVersion).toBe(2);

  const note = await db.notification.findFirst({ where: { userId: learner.id, type: "VERSION_MINOR", link: { contains: course.id } } });
  expect(note).not.toBeNull();
  // Bản MINOR không đặt lại lượt học
  const e1 = await db.enrollment.findFirstOrThrow({ where: { userId: learner.id, courseId: course.id } });
  expect(e1.status).toBe("COMPLETED");
  expect(e1.acknowledgedVersion).toBe(1);

  const page = await pageAs(browser, "TEST-LN1");
  await gotoReady(page, `/my-courses/${course.id}/updates`);
  await expect(page.getByText("Bổ sung bước kiểm tra thiết bị trước ca làm.")).toBeVisible();
  const ack = page.getByRole("button", { name: /Tôi đã đọc và nắm được/ });
  await expect(ack).toBeEnabled({ timeout: 30_000 });
  await ack.click();
  await expect.poll(async () => (await db.enrollment.findUniqueOrThrow({ where: { id: e1.id } })).acknowledgedVersion).toBe(2);
});

test("MAJOR: Biên soạn đề xuất → Admin công ty duyệt → học viên học lại, chứng nhận cũ được giữ", async ({ browser }) => {
  const { course, lessons } = await createCourse({ title: `Khoá MAJOR ${uid()}`, hasCertificate: true, certificateValidMonths: 12 });
  const learner = await completedV1("TEST-LN2", course.id, lessons.map((l) => l.id), true);

  // Biên soạn chỉ được ĐỀ XUẤT bản MAJOR
  const ce = await pageAs(browser, "TEST-CE1");
  const dialog = await openUpdateDialog(ce, course.id, /^MAJOR/, "Thay đổi toàn bộ quy trình nhận hàng.");
  await dialog.getByRole("button", { name: "Gửi đề xuất cho Admin" }).click();
  await expect.poll(async () => db.courseVersion.count({ where: { courseId: course.id, status: "PROPOSED" } })).toBe(1);
  expect((await db.course.findUniqueOrThrow({ where: { id: course.id } })).currentVersion).toBe(1);

  // Admin công ty duyệt
  const ca = await pageAs(browser, "TEST-CA1");
  await gotoReady(ca, `/content/courses/${course.id}`);
  await ca.getByRole("button", { name: "Duyệt & phát hành" }).first().click();
  const approve = ca.getByRole("dialog");
  for (let i = 0; i < 2 && (await approve.getByRole("button", { name: "Tiếp tục" }).isVisible()); i++) {
    await approve.getByRole("button", { name: "Tiếp tục" }).click();
  }
  const code = approve.locator("#confirm-code");
  if (await code.isVisible()) await code.fill(course.code);
  await approve.getByRole("button", { name: "Duyệt & phát hành" }).click();
  await expect.poll(async () => (await db.course.findUniqueOrThrow({ where: { id: course.id } })).currentVersion).toBe(2);

  // Học viên phải học lại: lượt học về chưa bắt đầu, tiến độ bài đặt lại; giữ completedVersion + chứng nhận cũ
  const e = await db.enrollment.findFirstOrThrow({ where: { userId: learner.id, courseId: course.id } });
  expect(e.status).toBe("NOT_STARTED");
  expect(e.progressPercent).toBe(0);
  expect(e.completedVersion).toBe(1);
  expect(e.dueDate).not.toBeNull();
  expect(await db.lessonProgress.count({ where: { userId: learner.id, lessonId: { in: lessons.map((l) => l.id) }, isCompleted: true } })).toBe(0);
  const certs = await db.certificate.findMany({ where: { userId: learner.id, courseId: course.id } });
  expect(certs).toHaveLength(1);
  expect(certs[0].courseVersion).toBe(1);
  expect(certs[0].revokedAt).toBeNull();
  expect(await db.notification.count({ where: { userId: learner.id, type: "VERSION_MAJOR" } })).toBeGreaterThan(0);
  expect((await db.courseVersion.findFirstOrThrow({ where: { courseId: course.id, versionNo: 2 } })).changeType).toBe("MAJOR");
});
