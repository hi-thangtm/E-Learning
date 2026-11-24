import { expect, test, type Page } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import { db, uid } from "./helpers/db";
import { makeXlsx, tinyPdf } from "./helpers/files";

/**
 * Kịch bản 2 — Soạn khoá (TEST-CE1): tạo khoá, chương, bài video YouTube, bài tài liệu + PDF, bài kiểm tra,
 * import câu hỏi Excel, kiểm tra điều kiện phát hành (chặn khi thiếu câu hỏi) rồi phát hành.
 */

async function addLesson(page: Page, sectionTitle: string, type: "Video" | "Tài liệu" | "Bài kiểm tra", title: string) {
  await page.getByRole("region", { name: new RegExp(sectionTitle) }).or(page.getByLabel(new RegExp(`Chương \\d+: ${sectionTitle}`))).getByRole("button", { name: "Thêm bài" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: new RegExp(`^${type}`) }).click();
  await dialog.locator("#new-lesson-title").fill(title);
  await dialog.getByRole("button", { name: "Tạo và điền chi tiết" }).click();
  // Sau khi tạo, dialog chi tiết bài mở ra
  await expect(page.getByRole("dialog").locator("#lesson-title")).toHaveValue(title);
  return page.getByRole("dialog");
}

test("biên soạn tạo khoá đủ 3 loại bài, import câu hỏi và phát hành (chặn khi chưa đủ điều kiện)", async ({ browser }) => {
  test.setTimeout(150_000);
  const page = await pageAs(browser, "TEST-CE1");
  const code = `E2E-SK-${uid()}`;
  const title = `Khoá soạn E2E ${code}`;

  // 1) Tạo khoá
  await gotoReady(page, "/content/courses");
  await page.getByRole("button", { name: "Tạo khoá học" }).first().click();
  let dialog = page.getByRole("dialog");
  await dialog.locator("#code").fill(code);
  await dialog.locator("#title").fill(title);
  await dialog.getByRole("button", { name: "Tạo và soạn" }).click();
  await expect(page).toHaveURL(/\/content\/courses\/[a-z0-9]+/);
  const course = await db.course.findUniqueOrThrow({ where: { code } });
  expect(course.status).toBe("DRAFT");

  // 2) Chương
  await gotoReady(page, `/content/courses/${course.id}?tab=content`);
  await page.getByRole("button", { name: "Thêm chương" }).first().click();
  dialog = page.getByRole("dialog");
  await dialog.locator("#section-title").fill("Chương mở đầu");
  await dialog.getByRole("button", { name: "Thêm chương" }).click();
  await expect(page.getByLabel(/Chương 1: Chương mở đầu/)).toBeVisible();

  // 3) Bài tài liệu: nội dung + PDF
  dialog = await addLesson(page, "Chương mở đầu", "Tài liệu", "Nội quy an toàn");
  await dialog.getByLabel("Nội dung bài tài liệu").click();
  await page.keyboard.type("Đọc kỹ nội quy trước khi vào xưởng.");
  await dialog.locator("#lesson-pdf").setInputFiles({ name: "noi-quy.pdf", mimeType: "application/pdf", buffer: tinyPdf() });
  await expect.poll(async () => (await db.lesson.findFirst({ where: { title: "Nội quy an toàn", section: { courseId: course.id } } }))?.fileUrl ?? null).not.toBeNull();
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // 4) Bài video YouTube — thời lượng đo bằng trình phát YouTube (cần mạng); không đo được thì điền qua DB và ghi chú
  dialog = await addLesson(page, "Chương mở đầu", "Video", "Video hướng dẫn");
  await dialog.getByRole("radio", { name: /YouTube/ }).click().catch(() => {});
  await dialog.locator("#youtube-url").fill("https://www.youtube.com/watch?v=M7lc1UVf-VE");
  const useVideo = dialog.getByRole("button", { name: "Dùng video này" });
  const measured = await useVideo.isEnabled({ timeout: 25_000 }).then(async () => {
    await expect(useVideo).toBeEnabled({ timeout: 25_000 });
    return true;
  }).catch(() => false);
  const videoLesson = await db.lesson.findFirstOrThrow({ where: { title: "Video hướng dẫn", section: { courseId: course.id } } });
  if (measured) {
    await useVideo.click();
    await expect.poll(async () => (await db.lesson.findUniqueOrThrow({ where: { id: videoLesson.id } })).videoStatus).toBe("READY");
  } else {
    test.info().annotations.push({ type: "ghi chú", description: "Không đo được thời lượng YouTube (không có mạng) — điền thời lượng qua DB" });
    await db.lesson.update({ where: { id: videoLesson.id }, data: { videoProvider: "YOUTUBE", videoId: "M7lc1UVf-VE", videoStatus: "READY", durationSeconds: 60 } });
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // 5) Bài kiểm tra: 2 câu, đạt 80
  dialog = await addLesson(page, "Chương mở đầu", "Bài kiểm tra", "Kiểm tra cuối khoá");
  await dialog.locator("#questionCount").fill("2");
  await dialog.locator("#passingScore").fill("80");
  await dialog.locator("#maxAttempts").fill("3");
  await dialog.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  // 6) Phát hành khi ngân hàng chưa có câu hỏi → bị chặn
  await page.reload();
  await page.getByRole("button", { name: "Phát hành" }).first().click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Kiểm tra cuối khoá: cần 2 câu .*ngân hàng có 0 câu/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Xác nhận phát hành" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // 7) Import câu hỏi Excel
  const xlsx = await makeXlsx(
    "Câu hỏi",
    ["Chủ đề", "Loại", "Nội dung*", "Phương án A*", "Phương án B*", "Phương án C", "Phương án D", "Phương án E", "Phương án F", "Đáp án đúng*", "Giải thích"],
    [
      ["", "Một đáp án", "Bình chữa cháy CO2 dùng cho đám cháy nào?", "Thiết bị điện", "Kim loại", "", "", "", "", "A", "CO2 không dẫn điện"],
      ["", "Một đáp án", "Khi nghe chuông báo cháy cần làm gì?", "Tiếp tục làm việc", "Di chuyển theo lối thoát hiểm", "", "", "", "", "B", ""],
      ["", "Nhiều đáp án", "Trang bị bảo hộ bắt buộc trong xưởng?", "Mũ bảo hộ", "Giày bảo hộ", "Dép lê", "", "", "", "A,B", ""],
    ],
  );
  await gotoReady(page, `/content/questions/import?course=${course.id}`);
  await page.locator('input[type="file"]').setInputFiles({ name: "cau-hoi.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: xlsx });
  await page.getByRole("button", { name: "Kiểm tra file" }).click();
  await page.getByRole("button", { name: "Xác nhận import" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: /^Thêm [\d.]+ câu hỏi$/ }).click();
  await expect.poll(async () => db.question.count({ where: { courseId: course.id } })).toBe(3);
  const multi = await db.question.findFirstOrThrow({ where: { courseId: course.id, type: "MULTIPLE" } });
  expect((multi.options as { isCorrect: boolean }[]).filter((o) => o.isCorrect)).toHaveLength(2);

  // 8) Phát hành
  await gotoReady(page, `/content/courses/${course.id}`);
  await page.getByRole("button", { name: "Phát hành" }).first().click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Phiên bản 1 — phát hành lần đầu")).toBeVisible();
  await dialog.getByRole("button", { name: "Xác nhận phát hành" }).click();
  await expect.poll(async () => (await db.course.findUniqueOrThrow({ where: { id: course.id } })).status).toBe("PUBLISHED");
  const published = await db.course.findUniqueOrThrow({ where: { id: course.id }, include: { versions: true } });
  expect(published.currentVersion).toBe(1);
  expect(published.versions.map((v) => v.changeType)).toEqual(["INITIAL"]);
});
