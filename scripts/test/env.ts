/**
 * Tạo .env.test cho bộ kiểm thử e2e (Việc 31):   npm run test:env   (thêm --force để tạo lại)
 * - .env.test đã có: chỉ BỔ SUNG biến còn thiếu (VD khoá Bunny giả lập của Việc 31B), không đổi bí mật cũ.
 * - DATABASE_URL: cùng máy chủ Postgres với .env, database elearning_test.
 * - AUTH_SECRET / CRON_SECRET: ngẫu nhiên, RIÊNG cho môi trường kiểm thử.
 * - TRUST_PROXY=true: giả lập chạy sau proxy — mỗi tài khoản kiểm thử đăng nhập từ 1 IP riêng (X-Forwarded-For) nên không chung
 *   giới hạn 10 lần/phút/IP. KHÔNG có cờ tắt giới hạn tần suất; giới hạn 5 lần/phút/mã NV vẫn áp dụng.
 * Không in bí mật ra màn hình. .env.test nằm trong .gitignore (.env*).
 */
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { argOf, withDatabase } from "../perf/common";
import { MOCK_BUNNY_PORT, MOCK_LARK_PORT, ROOT, TEST_DB_NAME, TEST_PORT } from "./common";

const target = path.join(ROOT, ".env.test");
const source = path.join(ROOT, ".env");

const mockBunny = `http://localhost:${MOCK_BUNNY_PORT}`;
/** Bunny Stream GIẢ LẬP (e2e/mock-bunny, Việc 31B): khoá ngẫu nhiên, địa chỉ trỏ sang máy giả. Không phải khoá Bunny thật. */
function bunnyLines(): string[] {
  return [
    "# Bunny Stream GIẢ LẬP (e2e/mock-bunny) — không phải khoá thật",
    `BUNNY_STREAM_LIBRARY_ID=${100000 + Math.floor(Math.random() * 800000)}`,
    `BUNNY_STREAM_API_KEY="${randomBytes(18).toString("hex")}"`,
    `BUNNY_STREAM_TOKEN_KEY="${randomBytes(18).toString("hex")}"`,
    `BUNNY_STREAM_READONLY_KEY="${randomBytes(18).toString("hex")}"`,
    `BUNNY_API_BASE=${mockBunny}`,
    `BUNNY_TUS_ENDPOINT=${mockBunny}/tusupload`,
    `BUNNY_EMBED_HOST=${mockBunny}`,
  ];
}

/** Lark GIẢ LẬP (e2e/mock-lark, Việc L1): App ID / Secret ngẫu nhiên, LARK_DOMAIN trỏ sang máy giả. Không phải app Lark thật. */
function larkLines(): string[] {
  return [
    "# Lark GIẢ LẬP (e2e/mock-lark) — không phải app thật",
    `LARK_APP_ID=cli_mock${randomBytes(6).toString("hex")}`,
    `LARK_APP_SECRET="${randomBytes(18).toString("hex")}"`,
    `LARK_DOMAIN=http://localhost:${MOCK_LARK_PORT}`,
  ];
}

if (fs.existsSync(target) && argOf("force") !== "true") {
  const current = fs.readFileSync(target, "utf8");
  const isMissing = (l: string) => {
    const key = l.match(/^([A-Z0-9_]+)=/)?.[1];
    return key && !new RegExp(`^\\s*${key}\\s*=`, "m").test(current);
  };
  const add = [bunnyLines(), larkLines()].flatMap((group) => {
    const missing = group.filter(isMissing);
    return missing.length ? [group[0], ...missing] : [];
  });
  if (add.length === 0) {
    console.log("• .env.test đã có đủ — giữ nguyên (chạy với --force để tạo lại).");
  } else {
    fs.writeFileSync(target, `${current.replace(/\n*$/, "\n")}${add.join("\n")}\n`, { mode: 0o600 });
    console.log(`✔ Đã bổ sung ${add.filter((l) => !l.startsWith("#")).length} biến giả lập vào .env.test.`);
  }
  process.exit(0);
}
if (!fs.existsSync(source)) {
  console.error("✘ Không có .env. Hãy copy .env.test.example thành .env.test và điền DATABASE_URL.");
  process.exit(1);
}
const env: Record<string, string> = {};
for (const line of fs.readFileSync(source, "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
if (!env.DATABASE_URL) {
  console.error("✘ .env không có DATABASE_URL.");
  process.exit(1);
}

const base = `http://localhost:${TEST_PORT}`;
const lines = [
  "# Sinh tự động bởi npm run test:env — môi trường KIỂM THỬ e2e (Việc 31). Không commit file này.",
  `DATABASE_URL="${withDatabase(env.DATABASE_URL, TEST_DB_NAME)}"`,
  `AUTH_SECRET="${randomBytes(33).toString("base64")}"`,
  `AUTH_URL=${base}`,
  `APP_URL=${base}`,
  "AUTH_TRUST_HOST=true",
  `CRON_SECRET="${randomBytes(24).toString("hex")}"`,
  "TRUST_PROXY=true",
  "UPLOAD_DIR=./.e2e-uploads",
  ...bunnyLines(),
  ...larkLines(),
  "",
];
fs.writeFileSync(target, lines.join("\n"), { mode: 0o600 });
console.log(`✔ Đã tạo .env.test (database ${TEST_DB_NAME}, cổng ${TEST_PORT}).`);
