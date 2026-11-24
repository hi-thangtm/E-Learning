import { createHmac, randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { gotoReady, pageAs } from "./helpers/auth";
import {
  attachBunnyVideo,
  BUNNY_ON,
  captureActions,
  createDraftVideoCourse,
  createMockVideo,
  embedToken,
  fakeVideoFile,
  LIBRARY_ID,
  MOCK_URL,
  mockConfig,
  mockRequests,
  mockReset,
  mockVideo,
  openLessonDialog,
  replayAction,
  setMockVideo,
  TICKET_CALL,
  uploadInDialog,
  wasDeleted,
} from "./helpers/bunny";
import { createCourse, db, enroll, uid } from "./helpers/db";
import { fakeIp, testEnv } from "./helpers/env";
import { runDailyJob } from "./helpers/job";

/**
 * Kịch bản 12 — Video Bunny Stream (Việc 31B) với Bunny GIẢ LẬP (e2e/mock-bunny, cổng 3201):
 * tải lên → xử lý → webhook / tác vụ hằng ngày / mở trang → READY; video lỗi; chặn phát hành; thay / xoá / ẩn bài;
 * vé tải lên dùng 1 lần (security-review #8); học viên xem bằng trình phát giả; webhook giả mạo; trang Cài đặt.
 * Chạy không Bunny (`npm run test:e2e:no-bunny`): chỉ chạy test “chưa cấu hình”.
 */

const lessonOf = (id: string) => db.lesson.findUniqueOrThrow({ where: { id } });

test.describe("Bunny Stream (giả lập)", () => {
  test.skip(!BUNNY_ON, "Chạy không Bunny");
  test.beforeAll(async () => mockReset());

  test("biên soạn tải video → đang xử lý → webhook báo xong → READY + thời lượng → phát hành được", async ({ browser }) => {
    const { course, lesson } = await createDraftVideoCourse();
    const page = await pageAs(browser, "TEST-CE1");
    await openLessonDialog(page, course.id, lesson.title);
    await uploadInDialog(page, fakeVideoFile("bai-giang.mp4", { seconds: 42 }));

    await expect.poll(async () => (await lessonOf(lesson.id)).videoProvider, { timeout: 20_000 }).toBe("BUNNY");
    await expect.poll(async () => (await lessonOf(lesson.id)).videoStatus, { timeout: 20_000 }).toBe("READY");
    const done = await lessonOf(lesson.id);
    expect(done.durationSeconds).toBe(42);
    expect(done.pendingVideoId).toBeNull();
    expect(await db.auditLog.count({ where: { action: "LESSON_VIDEO_UPLOAD_STARTED", entityId: lesson.id } })).toBe(1);
    expect((await mockRequests()).some((r) => r.method === "WEBHOOK" && r.path === done.videoId && r.status === 200)).toBe(true);

    await page.keyboard.press("Escape");
    await gotoReady(page, `/content/courses/${course.id}`);
    await page.getByRole("button", { name: "Phát hành" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(/video sẵn sàng/)).toBeVisible();
    await dialog.getByRole("button", { name: "Xác nhận phát hành" }).click();
    await expect.poll(async () => (await db.course.findUniqueOrThrow({ where: { id: course.id } })).status).toBe("PUBLISHED");
  });

  test("không có webhook + đóng dialog sớm → tác vụ hằng ngày hỏi lại Bunny; mở trang soạn khoá cũng tự cập nhật", async ({ browser }) => {
    await mockConfig({ webhook: false });
    try {
      // A. Tác vụ hằng ngày
      const { course, lesson } = await createDraftVideoCourse();
      const page = await pageAs(browser, "TEST-CE1");
      await openLessonDialog(page, course.id, lesson.title);
      await uploadInDialog(page, fakeVideoFile("dong-som.mp4", { seconds: 31 }));
      await expect.poll(async () => (await lessonOf(lesson.id)).videoStatus, { timeout: 20_000 }).toBe("PROCESSING");
      await page.keyboard.press("Escape");
      await page.close();
      const guid = (await lessonOf(lesson.id)).videoId!;
      await expect.poll(async () => (await mockVideo(guid))?.status, { timeout: 10_000 }).toBe(4);
      expect((await lessonOf(lesson.id)).videoStatus, "không webhook, dialog đã đóng → vẫn PROCESSING").toBe("PROCESSING");

      const job = await runDailyJob();
      expect(job.ok).toBe(true);
      expect(job.counts?.bunnyStatusSynced).toBeGreaterThanOrEqual(1);
      const afterJob = await lessonOf(lesson.id);
      expect([afterJob.videoStatus, afterJob.durationSeconds]).toEqual(["READY", 31]);

      // B. Mở trang soạn khoá: bài PROCESSING mà Bunny đã xong → tự cập nhật
      const other = await createDraftVideoCourse();
      const finished = await createMockVideo({ status: 4, length: 33 });
      await attachBunnyVideo(other.lesson.id, finished, "PROCESSING");
      const editor = await pageAs(browser, "TEST-CE1");
      await editor.goto(`/content/courses/${other.course.id}?tab=content`);
      await expect.poll(async () => (await lessonOf(other.lesson.id)).videoStatus).toBe("READY");
      expect((await lessonOf(other.lesson.id)).durationSeconds).toBe(33);
    } finally {
      await mockConfig({ webhook: true });
    }
  });

  test("video lỗi → FAILED, thông báo rõ, chặn phát hành", async ({ browser }) => {
    const { course, lesson } = await createDraftVideoCourse();
    const page = await pageAs(browser, "TEST-CE1");
    const dialog = await openLessonDialog(page, course.id, lesson.title);
    await uploadInDialog(page, fakeVideoFile("video-loi.mp4", { fail: true }));
    await expect.poll(async () => (await lessonOf(lesson.id)).videoStatus, { timeout: 20_000 }).toBe("FAILED");
    await expect(dialog.getByText("Bunny không xử lý được video này", { exact: false })).toBeVisible({ timeout: 20_000 });

    await page.keyboard.press("Escape");
    await gotoReady(page, `/content/courses/${course.id}`);
    await page.getByRole("button", { name: "Phát hành" }).first().click();
    const publish = page.getByRole("dialog");
    await expect(publish.getByText(/video xử lý lỗi/)).toBeVisible();
    await expect(publish.getByRole("button", { name: "Xác nhận phát hành" })).toBeDisabled();
  });

  test("khoá đã phát hành, bài video đang xử lý → chặn phát hành bản cập nhật, nêu rõ bài", async ({ browser }) => {
    const { course, lessons } = await createCourse({ title: `Khoá cập nhật video ${uid()}`, lessons: [{ type: "VIDEO", title: "Bài video đang đổi" }] });
    await attachBunnyVideo(lessons[0].id, await createMockVideo({ status: 1 }), "PROCESSING");

    const page = await pageAs(browser, "TEST-CE1");
    await gotoReady(page, `/content/courses/${course.id}`);
    await page.getByRole("button", { name: "Phát hành bản cập nhật" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("radio", { name: /^MINOR/ }).click();
    await dialog.getByRole("button", { name: "Tiếp tục" }).click();
    await dialog.locator("#version-summary [contenteditable]").click();
    await page.keyboard.type("Đổi video bài 1.");
    await dialog.getByRole("button", { name: "Tiếp tục" }).click();
    await dialog.getByRole("button", { name: "Phát hành", exact: true }).click();
    await expect(page.getByText(/Chưa phát hành được: còn bài video chưa sẵn sàng — .*Bài video đang đổi: video đang xử lý/).first()).toBeVisible();
    expect((await db.course.findUniqueOrThrow({ where: { id: course.id } })).currentVersion).toBe(1);
  });

  test("thay video → video cũ bị xoá trên Bunny; xoá hẳn bài (khoá nháp) → xoá video; ẩn bài (khoá đã phát hành) → giữ video", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-CE1");

    // Thay video
    const { course, lesson } = await createDraftVideoCourse();
    const oldGuid = await createMockVideo({ status: 4, length: 20 });
    await attachBunnyVideo(lesson.id, oldGuid, "READY", 20);
    const dialog = await openLessonDialog(page, course.id, lesson.title);
    await dialog.getByRole("button", { name: "Thay video" }).click();
    await uploadInDialog(page, fakeVideoFile("video-moi.mp4"));
    await expect.poll(async () => (await lessonOf(lesson.id)).videoId, { timeout: 20_000 }).not.toBe(oldGuid);
    await expect.poll(() => wasDeleted(oldGuid)).toBe(true);
    const newGuid = (await lessonOf(lesson.id)).videoId!;

    // Xoá hẳn bài của khoá nháp
    await page.keyboard.press("Escape");
    await gotoReady(page, `/content/courses/${course.id}?tab=content`);
    await page.getByRole("button", { name: `Xoá bài “${lesson.title}”` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Xoá hẳn" }).click();
    await expect.poll(async () => db.lesson.count({ where: { id: lesson.id } })).toBe(0);
    await expect.poll(() => wasDeleted(newGuid)).toBe(true);

    // Ẩn bài của khoá đã phát hành → giữ video
    const published = await createCourse({ title: `Khoá ẩn bài ${uid()}`, lessons: [{ type: "DOCUMENT" }, { type: "VIDEO", title: `Bài video ẩn ${uid()}` }] });
    const keep = await createMockVideo({ status: 4, length: 20 });
    const videoLesson = published.lessons[1];
    await attachBunnyVideo(videoLesson.id, keep, "READY", 20);
    await gotoReady(page, `/content/courses/${published.course.id}?tab=content`);
    await page.getByRole("button", { name: `Ẩn bài “${videoLesson.title}”` }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Ẩn khỏi học viên" }).click();
    await expect.poll(async () => (await lessonOf(videoLesson.id)).isArchived).toBe(true);
    expect(await wasDeleted(keep)).toBe(false);
    expect(await mockVideo(keep)).not.toBeNull();
  });

  test("#8 vé tải lên: tải lại xoá video chờ cũ; vé cũ / vé đã dùng / đổi videoId đều bị từ chối; chờ quá 24 giờ → tác vụ dọn", async ({ browser }) => {
    const { course, lesson } = await createDraftVideoCourse();
    const page = await pageAs(browser, "TEST-CE1");
    let blockComplete = true;
    const calls = await captureActions(page, (body) => blockComplete && TICKET_CALL.test(body));
    const dialog = await openLessonDialog(page, course.id, lesson.title);

    // Lần 1: tải xong nhưng lời gọi hoàn tất bị chặn (giả mất mạng) → video nằm ở pending
    await uploadInDialog(page, fakeVideoFile("lan-1.mp4"));
    await expect(dialog.getByText("Tải lên xong nhưng không lưu được vào bài")).toBeVisible({ timeout: 20_000 });
    const first = calls.find((c) => TICKET_CALL.test(c.body))!;
    const [, guid1] = first.body.match(/"([0-9a-f-]{36})"/)!;
    expect((await lessonOf(lesson.id)).pendingVideoId).toBe(guid1);

    // Lần 2: tải lại → video chờ cũ bị xoá trên Bunny, video mới gắn vào bài
    blockComplete = false;
    await uploadInDialog(page, fakeVideoFile("lan-2.mp4"));
    await expect.poll(async () => (await lessonOf(lesson.id)).videoId, { timeout: 20_000 }).not.toBeNull();
    const guid2 = (await lessonOf(lesson.id)).videoId!;
    expect(guid2).not.toBe(guid1);
    await expect.poll(() => wasDeleted(guid1)).toBe(true);

    // Dùng lại vé lần 1 (videoId không còn là pending) → từ chối
    expect(await replayAction(page, first)).toContain("Phiên tải lên không còn hiệu lực");
    // Dùng lại vé đã hoàn tất của lần 2 → từ chối
    const second = calls.filter((c) => TICKET_CALL.test(c.body)).find((c) => c.body.includes(guid2))!;
    expect(await replayAction(page, second)).toContain("Phiên tải lên không còn hiệu lực");
    // Đổi videoId (vé không khớp) → từ chối
    expect(await replayAction(page, second, second.body.replace(guid2, randomUUID()))).toContain("Phiên tải lên không hợp lệ");
    const after = await lessonOf(lesson.id);
    expect([after.videoId, after.pendingVideoId]).toEqual([guid2, null]);

    // Video chờ quá 24 giờ → tác vụ hằng ngày xoá trên Bunny + bỏ khỏi bài; chờ 1 giờ → giữ
    const stale = await createDraftVideoCourse();
    const fresh = await createDraftVideoCourse();
    const staleGuid = await createMockVideo();
    const freshGuid = await createMockVideo();
    await db.lesson.update({ where: { id: stale.lesson.id }, data: { pendingVideoId: staleGuid, pendingVideoCreatedAt: new Date(Date.now() - 25 * 3_600_000) } });
    await db.lesson.update({ where: { id: fresh.lesson.id }, data: { pendingVideoId: freshGuid, pendingVideoCreatedAt: new Date(Date.now() - 3_600_000) } });
    const job = await runDailyJob();
    expect(job.counts?.bunnyPendingCleaned).toBeGreaterThanOrEqual(1);
    expect((await lessonOf(stale.lesson.id)).pendingVideoId).toBeNull();
    expect(await wasDeleted(staleGuid)).toBe(true);
    expect((await lessonOf(fresh.lesson.id)).pendingVideoId).toBe(freshGuid);
    expect(await wasDeleted(freshGuid)).toBe(false);
  });

  test("học viên xem bằng trình phát Bunny giả: tiến độ theo thời gian thực, tua vượt bị kéo về, đủ % → hoàn thành; token hết hạn → bị từ chối", async ({ browser }) => {
    test.setTimeout(120_000);
    // Video 60 giây, trình phát giả chạy 2x (mức server cho phép: mỗi lần gửi ≤ 25 giây thực × 2 + 5) → xong ~27 giây
    await mockConfig({ playbackRate: 2 });
    try {
      const { course, lessons } = await createCourse({ title: `Khoá xem Bunny ${uid()}`, lessons: [{ type: "VIDEO", title: "Video Bunny 1 phút", minWatchPercent: 90 }] });
      const guid = await createMockVideo({ status: 4, length: 60 });
      await attachBunnyVideo(lessons[0].id, guid, "READY", 60);
      await enroll("TEST-LN2", course.id);
      const learner = await db.user.findUniqueOrThrow({ where: { employeeCode: "TEST-LN2" } });
      const progress = () => db.lessonProgress.findUnique({ where: { userId_lessonId: { userId: learner.id, lessonId: lessons[0].id } } });

      const page = await pageAs(browser, "TEST-LN2");
      await page.goto(`/learn/${course.id}/${lessons[0].id}`);
      const iframe = page.locator(`iframe[src^="${MOCK_URL}/embed/"]`);
      await expect(iframe).toBeVisible();
      const src = (await iframe.getAttribute("src"))!;
      const frame = page.frameLocator(`iframe[src^="${MOCK_URL}/embed/"]`);
      await frame.getByRole("button", { name: "▶ Phát" }).click();
      const started = Date.now();

      // Sau ~3 giây (đã xem ~6 giây video), giả người xem kéo thanh tua tới giây 50 → trang học kéo về chỗ đã xem
      await page.waitForTimeout(3_000);
      const mockFrame = page.frames().find((f) => f.url().startsWith(`${MOCK_URL}/embed/`))!;
      await mockFrame.evaluate(() => (window as unknown as { __mockSeek: (t: number) => void }).__mockSeek(50));
      await expect.poll(async () => (await mockRequests()).filter((r) => r.method === "SEEK" && r.path === guid && Number(r.note) < 20).length).toBeGreaterThan(0);
      await expect(page.getByText("Bạn cần xem hết phần trước")).toBeVisible();

      // Tiến độ ghi ở server không vượt thời gian xem thật (2x + 5 giây dư)
      await expect.poll(async () => (await progress())?.maxWatchedSeconds ?? 0, { timeout: 20_000 }).toBeGreaterThan(0);
      const early = (await progress())!;
      expect(early.maxWatchedSeconds).toBeLessThanOrEqual(((Date.now() - started) / 1000) * 2 + 6);
      expect(early.isCompleted).toBe(false);

      await expect.poll(async () => (await progress())?.isCompleted ?? false, { timeout: 70_000 }).toBe(true);
      expect((Date.now() - started) / 1000, "không thể hoàn thành nhanh hơn thời gian xem thật").toBeGreaterThanOrEqual(20);

      // Token hết hạn / sai → máy giả (như Bunny) trả 403; token đúng → 200
      const expired = Math.floor(Date.now() / 1000) - 60;
      const base = `${MOCK_URL}/embed/${LIBRARY_ID}/${guid}`;
      expect((await page.request.get(`${base}?token=${embedToken(guid, expired)}&expires=${expired}`)).status()).toBe(403);
      expect((await page.request.get(src.replace(/token=[0-9a-f]+/, `token=${"0".repeat(64)}`))).status()).toBe(403);
      expect((await page.request.get(src)).status()).toBe(200);
    } finally {
      await mockConfig({ playbackRate: 1 });
    }
  });

  test("webhook giả mạo (video không tồn tại, Status sai, sai chữ ký) → luôn 200, không đổi dữ liệu", async ({ request }) => {
    const { lesson } = await createDraftVideoCourse();
    const guid = await createMockVideo({ status: 1 });
    await attachBunnyVideo(lesson.id, guid, "PROCESSING");
    const ip = fakeIp(`webhook-${uid()}`);
    const post = async (payload: object, signature?: string) => {
      const body = JSON.stringify(payload);
      const sig = signature ?? createHmac("sha256", testEnv.BUNNY_STREAM_READONLY_KEY).update(body).digest("hex");
      const res = await request.post("/api/bunny/webhook", { data: body, headers: { "content-type": "application/json", "x-bunnystream-signature": sig, "x-forwarded-for": ip } });
      expect(res.status()).toBe(200);
      expect(await res.text()).toBe("ok");
    };
    const event = (videoGuid: string, status = 3) => ({ VideoLibraryId: Number(LIBRARY_ID), VideoGuid: videoGuid, Status: status, EventId: randomUUID(), Timestamp: new Date().toISOString() });

    await post(event(randomUUID()));
    await post(event(guid, 3)); // Body nói "xong" nhưng Bunny thật (máy giả) còn đang xử lý
    await post({ hello: "world" });
    await new Promise((r) => setTimeout(r, 1_500));
    expect((await lessonOf(lesson.id)).videoStatus).toBe("PROCESSING");

    await setMockVideo(guid, { status: 4, length: 27 });
    await post(event(guid), "f".repeat(64)); // sai chữ ký
    await new Promise((r) => setTimeout(r, 1_500));
    expect((await lessonOf(lesson.id)).videoStatus).toBe("PROCESSING");

    await post(event(guid)); // đúng chữ ký → hỏi lại Bunny → READY
    await expect.poll(async () => (await lessonOf(lesson.id)).videoStatus).toBe("READY");
    expect((await lessonOf(lesson.id)).durationSeconds).toBe(27);
  });

  test("Cài đặt: kiểm tra kết nối — đúng / sai API key / sai Library ID; HTML không lộ khoá", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-GA");
    const check = async (expected: RegExp) => {
      await gotoReady(page, "/system/settings");
      await page.getByRole("button", { name: "Kiểm tra kết nối" }).click();
      await expect(page.getByTestId("bunny-status")).toHaveText(expected);
    };
    try {
      await check(/Đã kết nối/);
      await mockConfig({ acceptApiKey: "khoa-khac" });
      await check(/Lỗi: sai API key/);
      await mockConfig({ acceptApiKey: testEnv.BUNNY_STREAM_API_KEY, acceptLibraryId: "1" });
      await check(/Lỗi: sai Library ID/);
    } finally {
      await mockConfig({ acceptApiKey: testEnv.BUNNY_STREAM_API_KEY, acceptLibraryId: LIBRARY_ID });
    }
    await check(/Đã kết nối/);

    const html = await page.content();
    for (const key of ["BUNNY_STREAM_API_KEY", "BUNNY_STREAM_TOKEN_KEY", "BUNNY_STREAM_READONLY_KEY"]) {
      expect(html, `${key} không được có trong HTML`).not.toContain(testEnv[key]);
    }
    await expect(page.getByText(`••••${testEnv.BUNNY_STREAM_API_KEY.slice(-4)}`)).toBeVisible();
    await expect(page.getByText(/\/api\/bunny\/webhook/)).toBeVisible();
    expect(await db.auditLog.count({ where: { action: "BUNNY_CONNECTION_TESTED" } })).toBeGreaterThanOrEqual(4);
  });

  test("Cài đặt: nhập khoá trên giao diện — mã hoá khi lưu, ưu tiên hơn .env; xoá → quay về .env", async ({ browser }) => {
    const page = await pageAs(browser, "TEST-GA");
    const card = page.getByRole("region", { name: "Video Bunny Stream" });
    const save = async () => {
      await card.getByRole("button", { name: "Lưu cấu hình" }).click();
      await expect(page.getByText("Đã lưu cấu hình Bunny Stream")).toBeVisible();
    };
    const check = async (expected: RegExp) => {
      await gotoReady(page, "/system/settings");
      await card.getByRole("button", { name: "Kiểm tra kết nối" }).click();
      await expect(page.getByTestId("bunny-status")).toHaveText(expected);
    };
    const keys = [testEnv.BUNNY_STREAM_API_KEY, testEnv.BUNNY_STREAM_TOKEN_KEY, testEnv.BUNNY_STREAM_READONLY_KEY];
    try {
      await gotoReady(page, "/system/settings");
      await expect(card.getByText("Đang dùng BUNNY_STREAM_* trong file .env")).toBeVisible();
      await card.getByLabel(/^Library ID/).fill(LIBRARY_ID);
      await card.getByLabel(/^API key/).fill(testEnv.BUNNY_STREAM_API_KEY);
      await card.getByLabel(/^Token key/).fill(testEnv.BUNNY_STREAM_TOKEN_KEY);
      await card.getByLabel(/^Read-Only key/).fill(testEnv.BUNNY_STREAM_READONLY_KEY);
      await save();

      // Lưu dạng mã hoá — database không có khoá thật
      const stored = JSON.stringify((await db.systemSetting.findUniqueOrThrow({ where: { key: "BUNNY_CREDENTIALS" } })).value);
      for (const k of keys) expect(stored).not.toContain(k);
      expect(stored).toContain('"libraryId":"' + LIBRARY_ID + '"');

      await check(/Đã kết nối/);
      const html = await page.content();
      for (const k of keys) expect(html).not.toContain(k);
      await expect(card.getByText(`Đã lưu (••••${testEnv.BUNNY_STREAM_API_KEY.slice(-4)})`)).toBeVisible();

      // Giao diện ưu tiên hơn .env: đổi API key trên giao diện (để trống ô khác = giữ) → Bunny báo sai khoá
      await card.getByLabel(/^API key/).fill("khoa-sai-tren-giao-dien");
      await save();
      await check(/Lỗi: sai API key/);

      // Xoá cấu hình → quay về .env
      await card.getByRole("button", { name: "Xoá cấu hình" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Xoá" }).click();
      await expect(page.getByText("Đã xoá cấu hình Bunny Stream trên giao diện")).toBeVisible();
      await check(/Đã kết nối/);
      expect(await db.auditLog.count({ where: { action: "BUNNY_CREDENTIALS_UPDATED" } })).toBeGreaterThanOrEqual(3);
    } finally {
      await db.systemSetting.deleteMany({ where: { key: "BUNNY_CREDENTIALS" } });
    }
  });
});

test.describe("Chưa cấu hình Bunny", () => {
  test.skip(BUNNY_ON, "Chỉ chạy khi không có Bunny (npm run test:e2e:no-bunny)");

  test("Cài đặt hiện “Chưa cấu hình”; lựa chọn Bunny trong bài Video bị khoá", async ({ browser }) => {
    const admin = await pageAs(browser, "TEST-GA");
    await gotoReady(admin, "/system/settings");
    await expect(admin.getByTestId("bunny-status")).toHaveText(/Chưa cấu hình/);
    await expect(admin.getByRole("button", { name: "Kiểm tra kết nối" })).toHaveCount(0);

    const { course, lesson } = await createDraftVideoCourse();
    const page: Page = await pageAs(browser, "TEST-CE1");
    const dialog = await openLessonDialog(page, course.id, lesson.title);
    await expect(dialog.getByRole("radio", { name: /Bunny Stream/ })).toBeDisabled();
    await expect(dialog.getByText("Chưa cấu hình Bunny Stream")).toBeVisible();
  });
});
