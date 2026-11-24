/**
 * Bộ kiểm thử toàn luồng (Việc 31) — `npm run test:e2e` (seed + build + chạy), `npm run test:e2e:ui` (xem từng bước).
 * Chạy BẢN PRODUCTION (`next start` cổng 3200, build sẵn) với database elearning_test (.env.test), giờ Việt Nam, tiếng Việt.
 * Hướng dẫn: node_modules/next/dist/docs/01-app/02-guides/testing/playwright.md
 *
 * Bunny Stream (Việc 31B): chạy kèm máy chủ Bunny GIẢ LẬP (e2e/mock-bunny, cổng 3201); app nhận BUNNY_* trong .env.test trỏ vào đó.
 * `E2E_NO_BUNNY=1` (npm run test:e2e:no-bunny): bỏ BUNNY_* khỏi app, không chạy máy giả → kiểm hệ thống khi CHƯA cấu hình Bunny.
 */
import { defineConfig, devices } from "@playwright/test";
import { assertTestDatabase, MOCK_BUNNY_PORT, MOCK_LARK_PORT, readTestEnv, TEST_PORT } from "./scripts/test/common";

const testEnv = readTestEnv();
assertTestDatabase(testEnv.DATABASE_URL);
const baseURL = `http://localhost:${TEST_PORT}`;
const noBunny = !!process.env.E2E_NO_BUNNY;
/** Env của app: bỏ mọi BUNNY_* khi chạy không Bunny */
const appEnv = noBunny ? Object.fromEntries(Object.entries(testEnv).filter(([k]) => !k.startsWith("BUNNY_"))) : testEnv;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Các file chạy song song; các test trong 1 file chạy tuần tự (mỗi file tự tạo dữ liệu riêng)
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Đăng nhập mỗi tài khoản 1 lần → e2e/.auth/<mã>.json
    { name: "dang-nhap", testMatch: /global\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["dang-nhap"],
      testIgnore: /99-.*\.spec\.ts/,
    },
    // Giới hạn đăng nhập / khoá tài khoản: chạy CUỐI (sau mọi kịch bản khác), tài khoản riêng
    {
      name: "chay-cuoi",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
      dependencies: ["chromium"],
      testMatch: /99-.*\.spec\.ts/,
    },
  ],
  webServer: [
    // Lark giả lập (Việc L1) — luôn chạy; app nhận LARK_DOMAIN trỏ vào đây
    {
      command: "npx tsx e2e/mock-lark/server.ts",
      url: `http://localhost:${MOCK_LARK_PORT}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...testEnv, MOCK_LARK_PORT: String(MOCK_LARK_PORT) },
      stdout: "ignore" as const,
      stderr: "pipe" as const,
    },
    ...(noBunny
      ? []
      : [
          {
            command: "npx tsx e2e/mock-bunny/server.ts",
            url: `http://localhost:${MOCK_BUNNY_PORT}/health`,
            reuseExistingServer: false,
            timeout: 30_000,
            env: { ...testEnv, MOCK_BUNNY_PORT: String(MOCK_BUNNY_PORT), MOCK_APP_WEBHOOK_URL: `${baseURL}/api/bunny/webhook` },
            stdout: "ignore" as const,
            stderr: "pipe" as const,
          },
        ]),
    {
      command: `npx next start -p ${TEST_PORT}`,
      url: `${baseURL}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      // Biến tiến trình ưu tiên hơn .env → app dùng elearning_test + khoá bí mật riêng của .env.test
      // (thêm BUNNY_*="" để chắc chắn KHÔNG lấy khoá Bunny thật trong .env khi chạy không Bunny)
      env: {
        ...appEnv,
        ...(noBunny && { BUNNY_STREAM_LIBRARY_ID: "", BUNNY_STREAM_API_KEY: "", BUNNY_STREAM_TOKEN_KEY: "", BUNNY_STREAM_READONLY_KEY: "" }),
        NODE_ENV: "production",
        TZ: "Asia/Ho_Chi_Minh",
      },
      // Log server (có lỗi "CredentialsSignin" khi test cố ý đăng nhập sai) — bật bằng E2E_SERVER_LOGS=1
      stdout: "ignore",
      stderr: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
    },
  ],
});
