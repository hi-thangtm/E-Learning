import { expect, test } from "@playwright/test";
import { pageAs } from "./helpers/auth";
import { BUNNY_ON, captureActions, createDraftVideoCourse, fakeVideoFile, openLessonDialog, PREPARE_CALL, replayAction, uploadInDialog } from "./helpers/bunny";
import { db } from "./helpers/db";

/**
 * Chạy cuối (project "chay-cuoi") — giới hạn tạo video Bunny: 20 lần / giờ / người (Việc 31B, security-review #8).
 * Tài khoản riêng TEST-SEC-CE (giới hạn tính theo người, không ảnh hưởng kịch bản 12 dùng TEST-CE1).
 */
test("tạo video Bunny quá 20 lần trong 1 giờ → bị chặn với thông báo tiếng Việt", async ({ browser }) => {
  test.skip(!BUNNY_ON, "Chạy không Bunny");
  test.setTimeout(120_000);
  const { course, lesson } = await createDraftVideoCourse();
  const page = await pageAs(browser, "TEST-SEC-CE");
  const calls = await captureActions(page);
  await openLessonDialog(page, course.id, lesson.title);

  // Lần 1 qua giao diện
  await uploadInDialog(page, fakeVideoFile("gioi-han.mp4"));
  await expect.poll(async () => (await db.lesson.findUniqueOrThrow({ where: { id: lesson.id } })).videoId, { timeout: 20_000 }).not.toBeNull();
  const prepare = calls.find((c) => PREPARE_CALL.test(c.body))!;
  expect(prepare, "phải ghi được lời gọi chuẩn bị tải lên").toBeTruthy();

  // Lần 2 → 20: vẫn được; lần 21 → chặn
  for (let i = 2; i <= 20; i++) {
    expect(await replayAction(page, prepare), `lần ${i}`).not.toContain("quá 20 lượt");
  }
  expect(await replayAction(page, prepare)).toContain("Bạn đã tạo quá 20 lượt tải video trong 1 giờ");
});
