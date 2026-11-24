import { expect, test, type Page } from "@playwright/test";
import { gotoReady, loginUi, pageAs } from "./helpers/auth";
import { createCourse, db, enroll, resetAccount, userByCode } from "./helpers/db";
import { BASE_URL, PASSWORD } from "./helpers/env";

/** Kịch bản 4 — Học viên: đổi mật khẩu lần đầu, Khoá của tôi, học tuần tự, tài liệu, video, bài kiểm tra, chứng nhận, /verify, đánh giá. */

test("lần đầu đăng nhập bắt đổi mật khẩu rồi mới vào được hệ thống", async ({ browser }) => {
  await resetAccount("TEST-NEW", { mustChangePassword: true });
  const page = await loginUi(browser, "TEST-NEW");
  await expect(page).toHaveURL(/\/change-password/);
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/change-password/);

  await page.locator('input[name="currentPassword"]').fill(PASSWORD);
  await page.locator('input[name="newPassword"]').fill("MatKhauMoi9");
  await page.locator('input[name="confirmPassword"]').fill("MatKhauMoi9");
  await page.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(page).toHaveURL(/\/dashboard/);
  expect((await userByCode("TEST-NEW")).mustChangePassword).toBe(false);
});

test("Khoá của tôi + học tuần tự: bài sau khoá đến khi xong bài trước, tài liệu phải đọc đủ 15 giây", async ({ browser }) => {
  const { course, lessons } = await createCourse({ title: "Khoá học tuần tự E2E", lessons: [{ type: "DOCUMENT", title: "Bài đọc 1" }, { type: "DOCUMENT", title: "Bài đọc 2" }] });
  await enroll("TEST-LN1", course.id);
  const page = await pageAs(browser, "TEST-LN1");

  await page.goto("/my-courses");
  await expect(page.getByText("Khoá học tuần tự E2E").first()).toBeVisible();

  await page.goto(`/my-courses/${course.id}`);
  await expect(page.locator('[title="Hoàn thành bài trước để mở"]').filter({ hasText: "Bài đọc 2" })).toBeVisible();
  // Gõ thẳng URL bài 2 → về trang giới thiệu khoá, kèm thông báo “Bài này chưa mở” (Việc 33 F7)
  await page.goto(`/learn/${course.id}/${lessons[1].id}`);
  await expect(page).toHaveURL(new RegExp(`/my-courses/${course.id}\\?locked=1$`));
  await expect(page.getByRole("status").filter({ hasText: "Bài này chưa mở" })).toBeVisible();

  await gotoReady(page, `/learn/${course.id}/${lessons[0].id}`);
  const read = page.getByRole("button", { name: /Đã đọc xong/ });
  await expect(read).toBeDisabled();
  // Server cũng chặn nếu chưa đủ thời gian: đợi đúng 15 giây của trình duyệt
  await expect(read).toBeEnabled({ timeout: 20_000 });
  await read.click();
  await expect(page.getByText("Bạn đã đọc xong bài này.")).toBeVisible();

  await page.goto(`/learn/${course.id}/${lessons[1].id}`);
  await expect(page).toHaveURL(new RegExp(`/learn/${course.id}/${lessons[1].id}$`));
});

test("tiến độ video qua /api/learn/progress: mỗi lần gửi chỉ tính tối đa 25 giây thời gian thực", async ({ browser }) => {
  const { course, lessons } = await createCourse({ lessons: [{ type: "VIDEO", title: "Video E2E", duration: 300, minWatchPercent: 90 }] });
  await enroll("TEST-LN2", course.id);
  const user = await userByCode("TEST-LN2");
  const page = await pageAs(browser, "TEST-LN2");
  await page.goto(`/learn/${course.id}/${lessons[0].id}`); // mở bài = mốc thời gian
  const post = (position: number, watched: number) =>
    page.request.post("/api/learn/progress", { data: { lessonId: lessons[0].id, position, watched }, headers: { Origin: BASE_URL } });
  const progress = () => db.lessonProgress.findUniqueOrThrow({ where: { userId_lessonId: { userId: user.id, lessonId: lessons[0].id } } });

  // Gửi "đã xem hết" ngay khi mở → chỉ được vài giây
  expect((await post(300, 300)).ok()).toBe(true);
  expect((await progress()).maxWatchedSeconds).toBeLessThanOrEqual(10);

  // Bỏ trang 10 phút rồi gửi "đã xem hết" → chỉ cộng tối đa 25 giây × 2 + 5
  const before = (await progress()).maxWatchedSeconds;
  await db.lessonProgress.update({ where: { id: (await progress()).id }, data: { updatedAt: new Date(Date.now() - 600_000) } });
  await post(300, 300);
  const after = await progress();
  expect(after.maxWatchedSeconds).toBeLessThanOrEqual(before + 55);
  expect(after.isCompleted).toBe(false);

  // Xem đủ 90% (đúng nhịp) → hoàn thành bài
  await db.lessonProgress.update({ where: { id: after.id }, data: { maxWatchedSeconds: 250, updatedAt: new Date(Date.now() - 20_000) } });
  const res = await post(290, 290);
  expect(((await res.json()) as { completed: boolean }).completed).toBe(true);
  expect((await progress()).isCompleted).toBe(true);

  // Gửi từ trang khác (Origin lạ) → 403
  const csrf = await page.request.post("/api/learn/progress", { data: { lessonId: lessons[0].id, position: 1, watched: 1 }, headers: { Origin: "https://evil.example" } });
  expect(csrf.status()).toBe(403);
});

async function answerAll(page: Page, label: "Đáp án đúng" | "Đáp án sai") {
  for (;;) {
    await page.getByLabel(label).check();
    await page.waitForLoadState("networkidle"); // câu trả lời được lưu ngay khi chọn
    const next = page.getByRole("button", { name: "Câu sau" });
    if (await next.isVisible()) {
      await next.click();
      continue;
    }
    await page.getByRole("button", { name: "Nộp bài" }).first().click();
    const confirm = page.getByRole("alertdialog").getByRole("button", { name: "Vẫn nộp bài" });
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    return;
  }
}

test("bài kiểm tra: trượt thì chưa hiện đáp án, đạt mới hiện", async ({ browser }) => {
  // Thêm 1 bài sau bài kiểm tra để đạt bài kiểm tra chưa phải xong khoá (không bật màn chúc mừng che kết quả)
  const { course, lessons } = await createCourse({
    lessons: [{ type: "QUIZ", title: "Kiểm tra E2E", questionCount: 2, passingScore: 100, maxAttempts: 3, showAnswers: true }, { type: "DOCUMENT", title: "Bài sau kiểm tra" }],
  });
  await enroll("TEST-LN3", course.id);
  const page = await pageAs(browser, "TEST-LN3");
  await gotoReady(page, `/learn/${course.id}/${lessons[0].id}`);

  await page.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  await answerAll(page, "Đáp án sai");
  await expect(page.getByText("Không đạt").first()).toBeVisible();
  await expect(page.getByText("Đáp án sẽ hiện khi bạn đạt hoặc đã dùng hết lượt làm bài.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Xem lại đáp án" })).toHaveCount(0);

  await page.getByRole("button", { name: "Làm lại" }).click();
  await answerAll(page, "Đáp án đúng");
  await expect(page.getByText("Đạt", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Xem lại đáp án" })).toBeVisible();

  const user = await userByCode("TEST-LN3");
  const attempts = await db.quizAttempt.findMany({ where: { userId: user.id, lessonId: lessons[0].id }, orderBy: { attemptNo: "asc" } });
  expect(attempts.map((a) => a.passed)).toEqual([false, true]);
});

test("hoàn thành khoá → chứng nhận → tải PDF → tra cứu /verify khi chưa đăng nhập → đánh giá khoá", async ({ browser }) => {
  const { course, lessons } = await createCourse({ title: "Khoá có chứng nhận E2E", lessons: [{ type: "DOCUMENT" }], hasCertificate: true, certificateValidMonths: 12 });
  await enroll("TEST-LN4", course.id);
  const page = await pageAs(browser, "TEST-LN4");
  await gotoReady(page, `/learn/${course.id}/${lessons[0].id}`);
  const read = page.getByRole("button", { name: /Đã đọc xong/ });
  await expect(read).toBeEnabled({ timeout: 20_000 });
  await read.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Chúc mừng bạn đã hoàn thành khoá học!")).toBeVisible();
  const user = await userByCode("TEST-LN4");
  const cert = await db.certificate.findFirstOrThrow({ where: { userId: user.id, courseId: course.id } });
  expect(cert.courseVersion).toBe(1);
  expect(cert.expiresAt).not.toBeNull();

  // Tải PDF → file PDF hợp lệ
  const download = page.waitForEvent("download");
  await dialog.getByRole("link", { name: "Tải chứng nhận" }).click();
  const file = await (await download).createReadStream();
  const chunks: Buffer[] = [];
  for await (const c of file) chunks.push(c as Buffer);
  const pdf = Buffer.concat(chunks);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  expect(pdf.length).toBeGreaterThan(1000);

  // Đánh giá ngay trong màn chúc mừng
  await dialog.getByRole("radio", { name: /^5 sao/ }).click();
  await dialog.getByLabel("Nhận xét").fill("Khoá học rất hữu ích (E2E).");
  await dialog.getByRole("button", { name: "Gửi đánh giá" }).click();
  await expect.poll(async () => (await db.courseReview.findUnique({ where: { courseId_userId: { courseId: course.id, userId: user.id } } }))?.rating).toBe(5);

  // Tra cứu công khai — không đăng nhập
  const guest = await browser.newContext();
  const verify = await guest.newPage();
  await verify.goto(`/verify/${cert.code}`);
  await expect(verify.getByText(user.fullName)).toBeVisible();
  await expect(verify.getByText("Khoá có chứng nhận E2E")).toBeVisible();
  await expect(verify.getByText(user.employeeCode)).toHaveCount(0);
  await guest.close();
});
