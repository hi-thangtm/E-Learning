/**
 * Tạo .env.perf từ .env hiện có (Việc 30):   npm run perf:env
 * - DATABASE_URL: cùng máy chủ / tài khoản Postgres, đổi tên database thành elearning_perf.
 * - Không in giá trị bí mật ra màn hình. Đã có .env.perf thì giữ nguyên (thêm --force để tạo lại).
 * - .env.perf nằm trong .gitignore (mẫu .env*). Không có .env → copy .env.perf.example rồi sửa tay.
 */
import fs from "node:fs";
import path from "node:path";
import { PERF_DB_NAME, argOf, withDatabase } from "./common";

const root = path.resolve(__dirname, "..", "..");
const target = path.join(root, ".env.perf");
const source = path.join(root, ".env");

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

if (fs.existsSync(target) && argOf("force") !== "true") {
  console.log("• .env.perf đã có — giữ nguyên (chạy với --force để tạo lại).");
  process.exit(0);
}
if (!fs.existsSync(source)) {
  console.error("✘ Không có .env. Hãy copy .env.perf.example thành .env.perf và điền DATABASE_URL.");
  process.exit(1);
}

const env = parseEnv(fs.readFileSync(source, "utf8"));
if (!env.DATABASE_URL) {
  console.error("✘ .env không có DATABASE_URL.");
  process.exit(1);
}

const lines = [
  "# Sinh tự động bởi npm run perf:env — database RIÊNG để đo hiệu năng (Việc 30). Không commit file này.",
  `DATABASE_URL="${withDatabase(env.DATABASE_URL, PERF_DB_NAME)}"`,
  "# App chạy bằng docker-compose.perf.yml (cổng 3100)",
  "PERF_BASE_URL=http://localhost:3100",
  // Tác vụ hằng ngày / cài đặt cần các biến này khi chạy bằng tsx trên máy
  ...(env.AUTH_SECRET ? [`AUTH_SECRET="${env.AUTH_SECRET}"`] : []),
  `APP_URL=http://localhost:3100`,
  "",
];
fs.writeFileSync(target, lines.join("\n"), { mode: 0o600 });
console.log(`✔ Đã tạo .env.perf (database ${PERF_DB_NAME}, cùng máy chủ Postgres với .env).`);
