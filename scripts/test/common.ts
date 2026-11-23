/**
 * Dùng chung cho bộ kiểm thử e2e (Việc 31).
 * LỚP BẢO VỆ: mọi script / helper kiểm thử từ chối chạy nếu tên database trong DATABASE_URL không phải `elearning_test`
 * (bộ kiểm thử XOÁ SẠCH dữ liệu trước khi seed).
 */
import fs from "node:fs";
import path from "node:path";
import { databaseNameOf } from "../perf/common";

export const TEST_DB_NAME = "elearning_test";
export const TEST_PORT = 3200;
/** Cổng máy chủ Bunny Stream GIẢ LẬP (e2e/mock-bunny) — Việc 31B */
export const MOCK_BUNNY_PORT = 3201;
export const TEST_PASSWORD = "Test12345";
export const ROOT = path.resolve(__dirname, "..", "..");

/** Đọc .env.test (không ghi vào process.env). */
export function readTestEnv(): Record<string, string> {
  const file = path.join(ROOT, ".env.test");
  if (!fs.existsSync(file)) throw new Error("Chưa có .env.test — chạy: npm run test:env");
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Dừng ngay nếu URL không trỏ tới elearning_test. Trả về URL. */
export function assertTestDatabase(url: string | undefined): string {
  const name = databaseNameOf(url);
  if (name !== TEST_DB_NAME) {
    throw new Error(
      `Từ chối chạy: DATABASE_URL đang trỏ tới database "${name ?? "(không đọc được)"}", không phải "${TEST_DB_NAME}". ` +
        `Bộ kiểm thử chỉ chạy với .env.test (npm run test:env để tạo).`,
    );
  }
  return url!;
}
