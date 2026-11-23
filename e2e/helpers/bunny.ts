import { createHash } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { companyByCode, db, uid } from "./db";
import { testEnv } from "./env";

/**
 * Bunny Stream GIẢ LẬP (e2e/mock-bunny/server.ts, Việc 31B): điều khiển máy giả + tạo dữ liệu bài video Bunny.
 */

export const MOCK_URL = "http://localhost:3201";
/** Bộ kiểm thử đang chạy với Bunny (giả lập) — false khi `npm run test:e2e:no-bunny` */
export const BUNNY_ON = !process.env.E2E_NO_BUNNY && !!testEnv.BUNNY_STREAM_API_KEY;
export const LIBRARY_ID = testEnv.BUNNY_STREAM_LIBRARY_ID ?? "";

type LogEntry = { at: number; method: string; path: string; status: number; note?: string };

export async function mockRequests(): Promise<LogEntry[]> {
  return (await fetch(`${MOCK_URL}/__mock/requests`)).json() as Promise<LogEntry[]>;
}
/** Đã có lệnh DELETE video `guid` trên máy giả chưa */
export async function wasDeleted(guid: string): Promise<boolean> {
  return (await mockRequests()).some((r) => r.method === "DELETE" && r.path.endsWith(`/videos/${guid}`) && r.status === 200);
}
export async function mockConfig(patch: Record<string, unknown>) {
  await fetch(`${MOCK_URL}/__mock/config`, { method: "POST", body: JSON.stringify(patch) });
}
export async function mockReset() {
  await fetch(`${MOCK_URL}/__mock/reset`, { method: "POST" });
}
export async function mockVideo(guid: string): Promise<{ status: number; length: number } | null> {
  const res = await fetch(`${MOCK_URL}/__mock/videos/${guid}`);
  return res.ok ? ((await res.json()) as { status: number; length: number }) : null;
}
export async function setMockVideo(guid: string, patch: { status?: number; length?: number }) {
  await fetch(`${MOCK_URL}/__mock/videos/${guid}`, { method: "POST", body: JSON.stringify(patch) });
}

/** Tạo video trên máy giả bằng API (như server tạo), tuỳ chọn đặt sẵn trạng thái (4 = xong) */
export async function createMockVideo(opts: { status?: number; length?: number } = {}): Promise<string> {
  const res = await fetch(`${MOCK_URL}/library/${LIBRARY_ID}/videos`, {
    method: "POST",
    headers: { AccessKey: testEnv.BUNNY_STREAM_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ title: `Video kiểm thử ${uid()}` }),
  });
  const { guid } = (await res.json()) as { guid: string };
  if (opts.status !== undefined) await setMockVideo(guid, { status: opts.status, length: opts.length ?? 20 });
  return guid;
}

/** File video giả để chọn trong ô tải lên. Nội dung: "DUR=<giây>" đặt thời lượng; `fail` → chứa "LOI" (máy giả báo lỗi xử lý). */
export function fakeVideoFile(name: string, opts: { seconds?: number; fail?: boolean; size?: number } = {}) {
  const marker = `MOCKVIDEO DUR=${opts.seconds ?? 20}${opts.fail ? " LOI" : ""} `;
  const buffer = Buffer.alloc(opts.size ?? 32 * 1024, 32);
  buffer.write(marker, 0, "latin1");
  const ext = name.split(".").pop()?.toLowerCase();
  const mimeType = ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : ext === "mkv" ? "video/x-matroska" : "video/mp4";
  return { name, mimeType, buffer };
}

/** Token nhúng theo công thức Bunny: SHA256_HEX(tokenKey + videoId + expires) */
export function embedToken(guid: string, expires: number): string {
  return createHash("sha256").update(`${testEnv.BUNNY_STREAM_TOKEN_KEY}${guid}${expires}`).digest("hex");
}

/** Khoá NHÁP (chưa phát hành) có 1 bài video chưa có video — để tải lên rồi phát hành lần đầu */
export async function createDraftVideoCourse(opts: { lessonTitle?: string; ownerCompany?: string } = {}) {
  const owner = await companyByCode(opts.ownerCompany ?? "CTY1");
  const code = `BN-${uid()}`;
  const course = await db.course.create({
    data: { ownerCompanyId: owner.id, code, title: `Khoá video Bunny ${code}`, status: "DRAFT", currentVersion: 0 },
  });
  const section = await db.courseSection.create({ data: { courseId: course.id, title: "Chương video" } });
  const lesson = await db.lesson.create({ data: { sectionId: section.id, sortOrder: 0, type: "VIDEO", title: opts.lessonTitle ?? `Bài video ${uid()}` } });
  return { course, section, lesson };
}

/** Gắn sẵn video Bunny (trên máy giả) vào bài trong DB */
export async function attachBunnyVideo(lessonId: string, guid: string, status: "PROCESSING" | "READY" | "FAILED", durationSeconds: number | null = 20) {
  await db.lesson.update({
    where: { id: lessonId },
    data: { videoProvider: "BUNNY", videoId: guid, videoStatus: status, durationSeconds: status === "READY" ? durationSeconds : null },
  });
}

/** Mở dialog bài học trên tab Nội dung */
export async function openLessonDialog(page: Page, courseId: string, lessonTitle: string) {
  await page.goto(`/content/courses/${courseId}?tab=content`);
  await page.waitForLoadState("networkidle");
  // Nút mở bài là nút có CHỮ tên bài (nút kéo sắp xếp chỉ có aria-label)
  await page.locator("button", { hasText: lessonTitle }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Chọn nguồn Bunny (nếu cần) rồi chọn file → trình duyệt tải lên máy giả bằng TUS */
export async function uploadInDialog(page: Page, file: ReturnType<typeof fakeVideoFile>) {
  const dialog = page.getByRole("dialog");
  const bunny = dialog.getByRole("radio", { name: /Bunny Stream/ });
  if (await bunny.isVisible().catch(() => false)) await bunny.click();
  await dialog.locator("#bunny-video-file").setInputFiles(file);
}

// --- Ghi lại / phát lại server action (kiểm vé tải lên — security-review #8) ---

export type CapturedAction = { url: string; headers: Record<string, string>; body: string };

/** Ghi lại mọi lời gọi server action trên trang (POST có header Next-Action). `abort(body)` = true → chặn không cho tới server. */
export async function captureActions(page: Page, abort: (body: string) => boolean = () => false): Promise<CapturedAction[]> {
  const calls: CapturedAction[] = [];
  await page.route("**/content/courses/**", async (route) => {
    const req = route.request();
    const headers = req.headers();
    if (req.method() === "POST" && headers["next-action"]) {
      const body = req.postData() ?? "";
      calls.push({ url: req.url(), headers, body });
      if (abort(body)) return route.abort();
    }
    return route.continue();
  });
  return calls;
}

/** Lời gọi hoàn tất / huỷ tải lên: đối số ["lessonId", "<guid>", "<expire>.<hmac>"] */
export const TICKET_CALL = /"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}","\d+\.[0-9a-f]{64}"/;
/** Lời gọi chuẩn bị tải lên: đối số ["lessonId", {name, size, type}] */
export const PREPARE_CALL = /\{"name":"[^"]+","size":\d+,"type":"[^"]*"\}/;

/** Gửi lại 1 server action đã ghi (cùng cookie phiên) → nội dung trả về (dạng RSC, chứa thông báo) */
export async function replayAction(page: Page, call: CapturedAction, body = call.body): Promise<string> {
  const pick = (k: string) => (call.headers[k] ? { [k]: call.headers[k] } : {});
  const res = await page.request.post(call.url, {
    headers: { ...pick("next-action"), ...pick("next-router-state-tree"), ...pick("content-type"), accept: "text/x-component" },
    data: body,
  });
  return res.text();
}
