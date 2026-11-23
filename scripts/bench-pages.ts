/**
 * Đo thời gian tải trang THẬT qua HTTP (Việc 30):   npm run perf:bench [-- --label before] [--queries] [--only learner,manager,...]
 *
 * - App đo chạy bằng docker-compose.perf.yml (PERF_BASE_URL, mặc định http://localhost:3100), database elearning_perf (.env.perf).
 * - Đăng nhập từng tài khoản PERF-* qua Auth.js (CSRF + credentials, giữ cookie). Giới hạn đăng nhập 10 lần/phút/IP → tự giãn,
 *   và lưu phiên vào perf-results/sessions.json (dùng lại trong 11 giờ).
 * - Mỗi trang: 1 lần làm nóng + 5 lần đo → trung vị, p95. Xuất Excel: thời gian + dung lượng. 20 học viên đồng thời: p95.
 * - Tác vụ hằng ngày: chạy runDailyJob trên elearning_perf (trong tiến trình này) → thời gian.
 * - Bộ nhớ: lấy mẫu `docker stats` mỗi giây → mức cao nhất của elearning-app / elearning-db theo từng giai đoạn.
 * - --queries: app phải chạy với PERF_LOG_QUERIES=true; mỗi trang 1 request rồi đọc /api/perf/queries (không đo thời gian).
 * Kết quả: in bảng + ghi perf-results/bench-<label>-<thời điểm>.json.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { argOf, assertPerfDatabase } from "./perf/common";

assertPerfDatabase();

const BASE = (process.env.PERF_BASE_URL ?? "http://localhost:3100").replace(/\/$/, "");
const PASSWORD = "Perf12345";
const RUNS = 5;
const OUT_DIR = path.resolve(__dirname, "..", "perf-results");
const SESSIONS_FILE = path.join(OUT_DIR, "sessions.json");
const LABEL = argOf("label") ?? "run";
const QUERIES = argOf("queries") === "true";
const ONLY = new Set((argOf("only") ?? "learner,manager,admin,export,concurrent,job").split(","));
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------------------------
// Đăng nhập (Auth.js credentials) + lưu phiên

type Sessions = Record<string, { cookie: string; at: number }>;
const sessions: Sessions = fs.existsSync(SESSIONS_FILE) ? JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf8")) : {};

function cookiesFrom(res: Response): string[] {
  return res.headers.getSetCookie().map((c) => c.split(";")[0]);
}

async function sessionValid(cookie: string): Promise<boolean> {
  const res = await fetch(`${BASE}/api/notifications/unread-count`, { headers: { cookie }, redirect: "manual" });
  await res.arrayBuffer();
  return res.status === 200;
}

async function login(code: string): Promise<string> {
  const cached = sessions[code];
  if (cached && Date.now() - cached.at < 11 * 3_600_000 && (await sessionValid(cached.cookie))) return cached.cookie;
  for (let attempt = 0; attempt < 6; attempt++) {
    const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
    const jar = cookiesFrom(csrfRes);
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "Content-Type": "application/x-www-form-urlencoded", cookie: jar.join("; ") },
      body: new URLSearchParams({ csrfToken, employeeCode: code, password: PASSWORD, callbackUrl: `${BASE}/dashboard` }),
    });
    await res.arrayBuffer();
    const session = cookiesFrom(res).find((c) => c.includes("session-token="));
    if (session) {
      sessions[code] = { cookie: session, at: Date.now() };
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
      return session;
    }
    const location = res.headers.get("location") ?? "";
    if (location.includes("rate_limited") || location.includes("code=rate")) {
      process.stdout.write(`  … giới hạn đăng nhập (10/phút/IP), chờ 61 giây (${code})\n`);
      await sleep(61_000);
      continue;
    }
    throw new Error(`Đăng nhập ${code} thất bại (HTTP ${res.status}, ${location})`);
  }
  throw new Error(`Đăng nhập ${code} thất bại sau nhiều lần thử`);
}

// ---------------------------------------------------------------------------------------------
// Đo

type Hit = { ms: number; status: number; bytes: number };
/** 1 request, tối đa 60 giây; kết nối bị kẹt → thử lại tối đa 2 lần (không tính vào số đo) */
async function hit(url: string, cookie: string): Promise<Hit> {
  for (let attempt = 0; ; attempt++) {
    try {
      const t = performance.now();
      const res = await fetch(`${BASE}${url}`, { headers: { cookie }, redirect: "manual", signal: AbortSignal.timeout(60_000) });
      const body = await res.arrayBuffer();
      return { ms: performance.now() - t, status: res.status, bytes: body.byteLength };
    } catch (e) {
      if (attempt >= 2) throw e;
      console.log(`  … hết thời gian chờ ${url}, thử lại`);
    }
  }
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
/** p95 theo phương pháp “nearest rank” (5 mẫu → lấy mẫu lớn nhất) */
const p95 = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.max(0, Math.ceil(xs.length * 0.95) - 1)];

type Row = { group: string; who: string; page: string; median: number; p95: number; kb: number; status: number; queries?: number };
const rows: Row[] = [];
let queryOverhead = 0;

async function queriesOf(cookie: string): Promise<number> {
  const res = await fetch(`${BASE}/api/perf/queries`, { headers: { cookie }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) throw new Error("App chưa bật PERF_LOG_QUERIES=true (xem docker-compose.perf.yml).");
  return ((await res.json()) as { queries: number }).queries;
}

async function measure(group: string, who: string, cookie: string, page: string) {
  if (QUERIES) {
    await queriesOf(cookie); // đặt lại
    const h = await hit(page, cookie);
    const q = (await queriesOf(cookie)) - queryOverhead;
    rows.push({ group, who, page, median: h.ms, p95: h.ms, kb: h.bytes / 1024, status: h.status, queries: q });
    console.log(`  ${who.padEnd(9)} ${page.padEnd(70)} ${String(q).padStart(4)} truy vấn  (HTTP ${h.status})`);
    return;
  }
  await hit(page, cookie); // làm nóng
  const hits: Hit[] = [];
  for (let i = 0; i < RUNS; i++) hits.push(await hit(page, cookie));
  const ms = hits.map((h) => h.ms);
  const row = { group, who, page, median: median(ms), p95: p95(ms), kb: hits[0].bytes / 1024, status: hits[0].status };
  rows.push(row);
  console.log(`  ${who.padEnd(9)} ${page.padEnd(70)} trung vị ${row.median.toFixed(0).padStart(5)} ms · p95 ${row.p95.toFixed(0).padStart(5)} ms · ${row.kb.toFixed(0)} KB${row.status !== 200 ? ` · HTTP ${row.status}` : ""}`);
}

// ---------------------------------------------------------------------------------------------
// Bộ nhớ: docker stats

type Mem = { app: number; db: number };
const memPeaks: Record<string, Mem> = {};
let memPhase = "idle";
let memTimer: NodeJS.Timeout | null = null;

function parseMiB(s: string): number {
  const m = s.trim().match(/^([\d.]+)\s*([KMG]i?B)/i);
  if (!m) return 0;
  const v = Number(m[1]);
  const unit = m[2].toUpperCase();
  return unit.startsWith("G") ? v * 1024 : unit.startsWith("K") ? v / 1024 : v;
}

function sampleMemory(): Promise<void> {
  return new Promise((resolve) => {
    const p = spawn("docker", ["stats", "--no-stream", "--format", "{{.Name}};{{.MemUsage}}", "elearning-app", "elearning-db"]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("close", () => {
      const peak = (memPeaks[memPhase] ??= { app: 0, db: 0 });
      for (const line of out.trim().split("\n")) {
        const [name, usage] = line.split(";");
        const mib = parseMiB(usage ?? "");
        if (name === "elearning-app") peak.app = Math.max(peak.app, mib);
        if (name === "elearning-db") peak.db = Math.max(peak.db, mib);
      }
      resolve();
    });
    p.on("error", () => resolve());
  });
}
function startMemory() {
  const loop = async () => {
    await sampleMemory();
    memTimer = setTimeout(loop, 1000);
  };
  void loop();
}

// ---------------------------------------------------------------------------------------------

async function main() {
  console.log(`→ Đo ${BASE} (nhãn "${LABEL}"${QUERIES ? ", chế độ đếm truy vấn" : ""})`);
  const ping = await fetch(`${BASE}/login`).catch(() => null);
  if (!ping || ping.status !== 200) throw new Error(`Không gọi được ${BASE}/login — đã chạy docker-compose.perf.yml chưa?`);

  // Id mẫu từ database đo
  const userByCode = async (code: string) => prisma.user.findUniqueOrThrow({ where: { employeeCode: code }, select: { id: true, companyId: true } });
  const [ln1, mg1, ca1] = await Promise.all([userByCode("PERF-LN1"), userByCode("PERF-MG1"), userByCode("PERF-CA1")]);
  const ln1Enrollment = await prisma.enrollment.findFirstOrThrow({
    where: { userId: ln1.id, status: "IN_PROGRESS", learningPathId: null },
    orderBy: { createdAt: "asc" },
    select: { courseId: true },
  });
  const firstLesson = async (courseId: string) =>
    (await prisma.lesson.findFirstOrThrow({ where: { section: { courseId, isArchived: false }, isArchived: false }, orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }], select: { id: true } })).id;
  const learnUrl = `/learn/${ln1Enrollment.courseId}/${await firstLesson(ln1Enrollment.courseId)}`;
  const mg1Member = await prisma.user.findFirstOrThrow({
    where: { department: { OR: [{ managerId: mg1.id }, { parent: { managerId: mg1.id } }] }, role: "LEARNER", status: "ACTIVE" },
    select: { id: true },
  });

  const TABS = ["courses", "departments", "members", "versions", "certificates"];
  startMemory();
  await sleep(3000); // mẫu lúc nghỉ

  if (QUERIES) {
    const c = await login("PERF-GA");
    await queriesOf(c);
    queryOverhead = await queriesOf(c); // truy vấn của chính route đếm (đăng nhập)
    console.log(`  (mỗi lần đọc bộ đếm tự tốn ${queryOverhead} truy vấn — đã trừ)`);
  }

  if (ONLY.has("learner")) {
    console.log("\n# Học viên (PERF-LN1)");
    memPhase = "learner";
    const c = await login("PERF-LN1");
    for (const p of ["/dashboard", "/my-courses", `/my-courses/${ln1Enrollment.courseId}`, learnUrl, "/notifications", "/certificates", "/library"]) await measure("Học viên", "PERF-LN1", c, p);
  }

  if (ONLY.has("manager")) {
    console.log("\n# Trưởng phòng (PERF-MG1)");
    memPhase = "manager";
    const c = await login("PERF-MG1");
    for (const p of ["/team", "/team/members?overdue=1&sort=overdue&dir=desc", `/team/members/${mg1Member.id}`, ...TABS.map((t) => `/reports?tab=${t}`)]) await measure("Trưởng phòng", "PERF-MG1", c, p);
  }

  if (ONLY.has("admin")) {
    memPhase = "admin";
    console.log("\n# Admin công ty (PERF-CA1)");
    const ca = await login("PERF-CA1");
    for (const p of [...TABS.map((t) => `/reports?tab=${t}`), "/org/users", "/system/audit-logs", "/assign/manual", "/content/courses"]) await measure("Admin công ty", "PERF-CA1", ca, p);
    console.log("\n# Admin tập đoàn (PERF-GA)");
    const ga = await login("PERF-GA");
    for (const p of [
      ...TABS.map((t) => `/reports?tab=${t}`),
      ...TABS.map((t) => `/reports?tab=${t}&company=${ca1.companyId}`),
      "/system/overview",
      "/org/users",
      "/system/audit-logs",
      "/assign/manual",
      "/content/courses",
    ]) await measure("Admin tập đoàn", "PERF-GA", ga, p);
  }

  if (ONLY.has("export") && !QUERIES) {
    console.log("\n# Xuất Excel");
    const ga = await login("PERF-GA");
    const mg = await login("PERF-MG1");
    const exports: [string, string, string][] = [
      ...TABS.map((t) => ["PERF-GA", ga, `/reports/export?tab=${t}`] as [string, string, string]),
      ["PERF-MG1", mg, "/team/members/export"],
      ["PERF-GA", ga, "/system/audit-logs/export"],
    ];
    memPhase = "export";
    for (const [who, c, p] of exports) {
      const h = await hit(p, c);
      rows.push({ group: "Xuất", who, page: p, median: h.ms, p95: h.ms, kb: h.bytes / 1024, status: h.status });
      console.log(`  ${who.padEnd(9)} ${p.padEnd(70)} ${h.ms.toFixed(0).padStart(6)} ms · ${(h.bytes / 1024).toFixed(0)} KB${h.status !== 200 ? ` · HTTP ${h.status}` : ""}`);
    }
    memPhase = "exportAll";
    const all: Hit[] = [];
    for (let i = 0; i < 3; i++) all.push(await hit("/reports/export?tab=all", ga));
    const ms = all.map((h) => h.ms);
    rows.push({ group: "Xuất", who: "PERF-GA", page: "/reports/export?tab=all (xuất toàn bộ, 3 lần)", median: median(ms), p95: Math.max(...ms), kb: all[0].bytes / 1024, status: all[0].status });
    console.log(`  PERF-GA   /reports/export?tab=all                                                trung vị ${median(ms).toFixed(0)} ms · max ${Math.max(...ms).toFixed(0)} ms · ${(all[0].bytes / 1024).toFixed(0)} KB`);
  }

  if (ONLY.has("concurrent") && !QUERIES) {
    console.log("\n# 20 học viên đồng thời (PERF-LN1…LN20): /dashboard rồi /learn/…, 3 vòng");
    const learners: { cookie: string; learn: string }[] = [];
    for (let i = 1; i <= 20; i++) {
      const code = `PERF-LN${i}`;
      const u = await userByCode(code);
      const e = await prisma.enrollment.findFirst({ where: { userId: u.id, status: { in: ["IN_PROGRESS", "NOT_STARTED"] }, learningPathId: null, course: { status: "PUBLISHED" } }, select: { courseId: true } });
      if (!e) continue;
      learners.push({ cookie: await login(code), learn: `/learn/${e.courseId}/${await firstLesson(e.courseId)}` });
    }
    memPhase = "concurrent";
    const dash: number[] = [], learn: number[] = [];
    let errors = 0;
    for (let round = 0; round < 3; round++) {
      await Promise.all(
        learners.map(async (l) => {
          const a = await hit("/dashboard", l.cookie);
          const b = await hit(l.learn, l.cookie);
          dash.push(a.ms);
          learn.push(b.ms);
          if (a.status !== 200 || b.status !== 200) errors++;
        }),
      );
    }
    for (const [page, xs] of [["/dashboard (20 người cùng lúc)", dash], ["/learn/… (20 người cùng lúc)", learn]] as const) {
      rows.push({ group: "Đồng thời", who: `${learners.length} HV`, page, median: median(xs), p95: p95(xs), kb: 0, status: errors ? 500 : 200 });
      console.log(`  ${page.padEnd(40)} trung vị ${median(xs).toFixed(0)} ms · p95 ${p95(xs).toFixed(0)} ms · ${xs.length} lượt${errors ? ` · ${errors} lỗi` : ""}`);
    }
  }

  let job: { ms: number; counts: unknown } | null = null;
  if (ONLY.has("job") && !QUERIES) {
    console.log("\n# Tác vụ hằng ngày (runDailyJob trên elearning_perf)");
    memPhase = "job";
    const { runDailyJob } = await import("@/lib/jobs/daily");
    const t = performance.now();
    const r = await runDailyJob({ triggeredBy: null, trigger: "script" });
    job = { ms: performance.now() - t, counts: r.ok ? r.counts : r.message };
    console.log(`  ${job.ms.toFixed(0)} ms`, JSON.stringify(job.counts));
  }

  if (memTimer) clearTimeout(memTimer);
  await sampleMemory();
  console.log("\n# Bộ nhớ cao nhất (MiB) theo giai đoạn");
  console.table(Object.fromEntries(Object.entries(memPeaks).map(([k, v]) => [k, { app: Math.round(v.app), db: Math.round(v.db) }])));

  const file = path.join(OUT_DIR, `bench-${LABEL}-${new Date().toISOString().replace(/[:.]/g, "-")}${QUERIES ? "-queries" : ""}.json`);
  fs.writeFileSync(file, JSON.stringify({ label: LABEL, base: BASE, at: new Date().toISOString(), queries: QUERIES, rows, memPeaks, job }, null, 2));
  console.log(`\n✔ Đã ghi ${path.relative(process.cwd(), file)}`);
}

main()
  .catch((e) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (memTimer) clearTimeout(memTimer);
    await prisma.$disconnect();
  });
