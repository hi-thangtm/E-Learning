import path from "node:path";
import { assertTestDatabase, readTestEnv, TEST_PASSWORD, TEST_PORT } from "../../scripts/test/common";

export const testEnv = readTestEnv();
assertTestDatabase(testEnv.DATABASE_URL);

export const BASE_URL = `http://localhost:${TEST_PORT}`;
export const PASSWORD = TEST_PASSWORD;
export const AUTH_DIR = path.resolve(__dirname, "..", ".auth");

/** Tài khoản đăng nhập sẵn ở global setup (mỗi tài khoản 1 IP riêng) */
export const ACCOUNTS = [
  "TEST-GA", "TEST-CA1", "TEST-CA2", "TEST-CE1", "TEST-MG1",
  "TEST-LN1", "TEST-LN2", "TEST-LN3", "TEST-LN4", "TEST-LN5", "TEST-OUT", "TEST-CTY2-LN",
  "TEST-SEC-LN", "TEST-SEC-MG", "TEST-SEC-CE", "TEST-SEC-CA",
] as const;
export type Account = (typeof ACCOUNTS)[number];

/** File storageState của 1 tài khoản */
export const authFile = (code: string) => path.join(AUTH_DIR, `${code}.json`);

/** IP giả lập (X-Forwarded-For, app chạy với TRUST_PROXY=true) — mỗi tài khoản / test 1 IP để không chung giới hạn 10 lần/phút/IP */
let ipCounter = 0;
export function fakeIp(seed?: string): string {
  if (seed) {
    let h = 0;
    for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `10.${(h >> 16) & 255}.${(h >> 8) & 255}.${(h & 254) + 1}`;
  }
  ipCounter++;
  return `10.250.${(process.pid + ipCounter) % 250}.${ipCounter % 250 + 1}`;
}
