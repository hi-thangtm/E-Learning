/**
 * Chụp ảnh minh hoạ cho trang Hướng dẫn sử dụng (/help).
 *
 *   npm run build && npx next start -p 3000        # app chạy bằng next start, DB dev đang có dữ liệu demo
 *   npm run help:shots                             # chụp tất cả
 *   npm run help:shots -- --only hv-video,qt-users # chụp lại vài ảnh
 *   npm run help:shots -- --base http://localhost:3100
 *
 * - Dữ liệu: database trong .env (DATABASE_URL) phải là dữ liệu demo (`npm run demo:seed -- --yes`, docs/demo-data.md).
 * - Kết quả: public/images/help/<tên>.jpg + src/lib/help/shots-manifest.json ({ tên: { w, h, mobile } }).
 *   Nội dung trang /help tham chiếu ảnh theo tên → thiếu ảnh là lỗi tsc.
 * - Chỉ XEM: không bấm lưu / gửi / nộp (xem scripts/help/shots.ts).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, request, type Browser, type BrowserContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { SHOTS, type HelpIds, type HelpUser } from "./shots";

const args = process.argv.slice(2);
const arg = (name: string, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : fallback;
};

const BASE = arg("base", `http://localhost:${process.env.APP_PORT || 3000}`).replace(/\/$/, "");
const ONLY = arg("only").split(",").filter(Boolean);
const PASSWORD = "123456789";
const OUT_DIR = path.resolve("public/images/help");
const MANIFEST = path.resolve("src/lib/help/shots-manifest.json");
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Ẩn nút Next dev, con trỏ nhấp nháy, thanh cuộn — ảnh gọn và ổn định. */
const CLEAN_CSS = `
nextjs-portal { display: none !important; }
* { caret-color: transparent !important; }
::-webkit-scrollbar { display: none; }
[data-sonner-toaster] { display: none !important; }
`;

async function lookupIds(db: PrismaClient): Promise<HelpIds> {
  const course = async (code: string) => (await db.course.findUniqueOrThrow({ where: { code }, select: { id: true } })).id;
  const lesson = async (courseCode: string, type: "VIDEO" | "DOCUMENT" | "QUIZ") => {
    const l = await db.lesson.findFirst({
      where: { type, isArchived: false, section: { isArchived: false, course: { code: courseCode } } },
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: { id: true, title: true },
    });
    if (!l) throw new Error(`Khoá ${courseCode} không có bài ${type}`);
    return l;
  };
  const tm001 = await db.user.findUniqueOrThrow({ where: { employeeCode: "TM-001" }, select: { id: true } });
  const cert = await db.certificate.findFirst({
    where: { userId: tm001.id, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: { code: true },
  });
  if (!cert) throw new Error("TM-001 không có chứng nhận còn hiệu lực");
  const library = await db.course.findFirst({
    where: { status: "PUBLISHED", allowSelfEnroll: true, enrollments: { none: { userId: tm001.id } } },
    orderBy: { code: "asc" },
    select: { id: true },
  });
  if (!library) throw new Error("Không có khoá tự đăng ký nào TM-001 chưa học");
  const rule = await db.assignmentRule.findFirstOrThrow({ where: { isActive: true }, orderBy: { createdAt: "asc" }, select: { id: true } });
  const video = await lesson("AT-01", "VIDEO");
  return {
    courseAT01: await course("AT-01"),
    courseIT01: await course("IT-01"),
    courseNQ01: await course("NQ-01"),
    courseSP01: await course("TM-SP-01"),
    courseKN02: await course("KN-02"),
    libraryCourse: library.id,
    pathLTKD: (await db.learningPath.findUniqueOrThrow({ where: { code: "LT-KD" }, select: { id: true } })).id,
    userTM001: tm001.id,
    ruleId: rule.id,
    certCode: cert.code,
    lessonVideoAT01: video.id,
    lessonVideoAT01Title: video.title,
    lessonDocKN02: (await lesson("KN-02", "DOCUMENT")).id,
    lessonQuizAT01: (await lesson("AT-01", "QUIZ")).id,
    lessonQuizNQ01: (await lesson("NQ-01", "QUIZ")).id,
  };
}

async function login(code: string) {
  const api = await request.newContext({ baseURL: BASE });
  const { csrfToken } = (await (await api.get("/api/auth/csrf")).json()) as { csrfToken: string };
  await api.post("/api/auth/callback/credentials", {
    form: { csrfToken, employeeCode: code, password: PASSWORD, callbackUrl: `${BASE}/dashboard` },
    maxRedirects: 0,
  });
  const state = await api.storageState();
  await api.dispose();
  if (!state.cookies.some((c) => c.name.includes("session-token"))) {
    throw new Error(`Đăng nhập ${code} thất bại — DB có phải dữ liệu demo không (mật khẩu ${PASSWORD})?`);
  }
  return state;
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (/elearning_(test|perf)/.test(dbUrl)) throw new Error("Chỉ chạy với database dữ liệu demo (không phải elearning_test / elearning_perf).");
  const db = new PrismaClient();
  let ids: HelpIds;
  try {
    const demo = await db.user.count({ where: { employeeCode: { in: ["ADMIN", "TM-001", "TM-004", "CA-TM", "CE-TONG", "MG-KD"] } } });
    if (demo < 6) throw new Error("Database chưa có dữ liệu demo — chạy `npm run demo:seed -- --yes` (XOÁ SẠCH DB dev) rồi chụp lại.");
    ids = await lookupIds(db);
  } finally {
    await db.$disconnect();
  }

  const shots = ONLY.length ? SHOTS.filter((s) => ONLY.includes(s.name)) : SHOTS;
  if (ONLY.length && shots.length !== ONLY.length) {
    throw new Error(`Không có ảnh tên: ${ONLY.filter((n) => !SHOTS.some((s) => s.name === n)).join(", ")}`);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const states = new Map<string, Awaited<ReturnType<typeof login>>>();
  for (const u of new Set(shots.map((s) => s.user).filter((u): u is Exclude<HelpUser, null> => !!u))) {
    states.set(u, await login(u));
  }

  const browser: Browser = await chromium.launch();
  const contexts = new Map<string, BrowserContext>();
  const contextFor = async (user: HelpUser, mobile: boolean) => {
    const key = `${user ?? "-"}|${mobile}`;
    let ctx = contexts.get(key);
    if (!ctx) {
      ctx = await browser.newContext({
        storageState: user ? states.get(user) : undefined,
        viewport: mobile ? MOBILE : DESKTOP,
        deviceScaleFactor: mobile ? 2 : 1,
        isMobile: mobile,
        hasTouch: mobile,
        locale: "vi-VN",
        timezoneId: "Asia/Ho_Chi_Minh",
        colorScheme: "light",
      });
      contexts.set(key, ctx);
    }
    return ctx;
  };

  const manifest: Record<string, { w: number; h: number; mobile: boolean }> = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, "utf8"))
    : {};
  const failed: string[] = [];

  for (const shot of shots) {
    const mobile = !!shot.mobile;
    const page = await (await contextFor(shot.user, mobile)).newPage();
    const file = path.join(OUT_DIR, `${shot.name}.jpg`);
    try {
      const res = await page.goto(BASE + shot.path(ids));
      if (!res || res.status() >= 400) throw new Error(`HTTP ${res?.status()}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      await page.addStyleTag({ content: CLEAN_CSS });
      await page.evaluate(() => document.fonts.ready);
      await shot.prepare?.(page, ids);
      await page.waitForTimeout(300);
      const opts = { path: file, type: "jpeg" as const, quality: 80, animations: "disabled" as const };
      if (shot.target) await page.locator(shot.target).first().screenshot(opts);
      else await page.screenshot(opts);
      const meta = await sharp(file).metadata();
      manifest[shot.name] = { w: meta.width ?? 0, h: meta.height ?? 0, mobile };
      console.log(`✓ ${shot.name}  ${meta.width}×${meta.height}`);
    } catch (e) {
      failed.push(shot.name);
      console.error(`✗ ${shot.name}: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    } finally {
      await page.close();
    }
  }
  await browser.close();

  // Giữ thứ tự như SHOTS, bỏ tên không còn trong danh sách
  const ordered = Object.fromEntries(SHOTS.filter((s) => manifest[s.name]).map((s) => [s.name, manifest[s.name]]));
  fs.writeFileSync(MANIFEST, JSON.stringify(ordered, null, 2) + "\n");
  console.log(`\nĐã ghi ${Object.keys(ordered).length} ảnh vào ${path.relative(process.cwd(), MANIFEST)}`);
  if (failed.length) {
    console.error(`Lỗi ${failed.length} ảnh: ${failed.join(", ")}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
