/**
 * Chụp ảnh các trang để rà giao diện (Việc 32) — KHÔNG phải test, chỉ là công cụ xem nhanh.
 *
 *   npx tsx --env-file=.env.test scripts/ui-review/shots.ts --user TEST-LN1 --password Test12345 --preset learner --mobile
 *   npx tsx --env-file=.env.perf scripts/ui-review/shots.ts --base http://localhost:3100 --user PERF-GA --password Perf12345 --paths /org/users,/reports
 *
 * - Đăng nhập Auth.js bằng API (CSRF + credentials), mở từng trang, chờ tải xong, chụp toàn trang vào --out (mặc định perf-results/shots).
 * - In bảng: trang · mã HTTP · có cuộn ngang không (scrollWidth > chiều rộng màn hình) · tiêu đề tab.
 * - --preset learner: tự lấy 1 khoá / bài video / tài liệu / bài kiểm tra / chứng nhận của người đăng nhập từ database (DATABASE_URL).
 */
import fs from "node:fs";
import path from "node:path";
import { chromium, request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const args = process.argv.slice(2);
const arg = (name: string, fallback = "") => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? "") : fallback;
};
const flag = (name: string) => args.includes(`--${name}`);

const BASE = arg("base", "http://localhost:3200");
const USER = arg("user");
const PASSWORD = arg("password");
const OUT = path.resolve(arg("out", "perf-results/shots"));
const MOBILE = flag("mobile");
const VIEWPORT = MOBILE ? { width: 375, height: 667 } : { width: 1440, height: 900 };

async function learnerPaths(code: string): Promise<string[]> {
  const db = new PrismaClient();
  try {
    const user = await db.user.findUniqueOrThrow({ where: { employeeCode: code } });
    const enrollments = await db.enrollment.findMany({
      where: { userId: user.id, status: { not: "CANCELLED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { courseId: true, learningPathId: true, course: { select: { sections: { select: { lessons: { select: { id: true, type: true } } } } } } },
    });
    const pick = (type: "VIDEO" | "DOCUMENT" | "QUIZ") => {
      for (const e of enrollments) {
        const l = e.course.sections.flatMap((s) => s.lessons).find((x) => x.type === type);
        if (l) return `/learn/${e.courseId}/${l.id}`;
      }
      return null;
    };
    const cert = await db.certificate.findFirst({ where: { userId: user.id }, select: { code: true } });
    const pathId = enrollments.find((e) => e.learningPathId)?.learningPathId;
    const library = await db.course.findFirst({ where: { allowSelfEnroll: true, status: "PUBLISHED" }, select: { id: true } });
    return [
      "/dashboard",
      "/my-courses",
      enrollments[0] && `/my-courses/${enrollments[0].courseId}`,
      enrollments[0] && `/my-courses/${enrollments[0].courseId}/updates`,
      pick("VIDEO"),
      pick("DOCUMENT"),
      pick("QUIZ"),
      "/learning-paths",
      pathId && `/learning-paths/${pathId}`,
      "/library",
      library && `/library/${library.id}`,
      "/certificates",
      "/notifications",
      "/change-password",
      "/verify",
      cert && `/verify/${cert.code}`,
    ].filter((p): p is string => !!p);
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  if (!USER || !PASSWORD) throw new Error("Thiếu --user / --password");
  const paths = arg("preset") === "learner" ? await learnerPaths(USER) : arg("paths").split(",").filter(Boolean);
  fs.mkdirSync(OUT, { recursive: true });

  // Đăng nhập bằng API (IP giả riêng — app test chạy với TRUST_PROXY=true)
  const ip = `10.199.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250) + 1}`;
  const api = await request.newContext({ baseURL: BASE, extraHTTPHeaders: { "x-forwarded-for": ip } });
  const { csrfToken } = (await (await api.get("/api/auth/csrf")).json()) as { csrfToken: string };
  await api.post("/api/auth/callback/credentials", {
    form: { csrfToken, employeeCode: USER, password: PASSWORD, callbackUrl: `${BASE}/dashboard` },
    maxRedirects: 0,
  });
  const state = await api.storageState();
  if (!state.cookies.some((c) => c.name.includes("session-token"))) throw new Error(`Đăng nhập ${USER} thất bại`);

  const browser = await chromium.launch();
  const context = await browser.newContext({
    storageState: state,
    viewport: VIEWPORT,
    deviceScaleFactor: MOBILE ? 2 : 1,
    isMobile: MOBILE,
    hasTouch: MOBILE,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  });
  const page = await context.newPage();
  const rows: string[] = [];
  for (const p of paths) {
    const res = await page.goto(BASE + p);
    await page.waitForLoadState("networkidle").catch(() => {});
    const scrollW = await page.evaluate(() => document.documentElement.scrollWidth);
    const file = `${MOBILE ? "m" : "d"}-${p.replace(/^\//, "").replace(/[/?=&]/g, "_") || "root"}.png`;
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    rows.push(`${p}\t${res?.status()}\t${scrollW > VIEWPORT.width ? `CUỘN NGANG ${scrollW}px` : "ok"}\t${await page.title()}\t${file}`);
  }
  await browser.close();
  await api.dispose();
  console.log(["Trang\tHTTP\tChiều ngang\tTiêu đề tab\tẢnh", ...rows].join("\n"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
