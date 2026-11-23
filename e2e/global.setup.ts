import fs from "node:fs";
import { test as setup } from "@playwright/test";
import { loginApi } from "./helpers/auth";
import { ACCOUNTS, AUTH_DIR, authFile } from "./helpers/env";

/**
 * Đăng nhập MỖI tài khoản 1 lần (mỗi tài khoản 1 IP giả lập), lưu storageState để các test dùng lại.
 * Không tắt giới hạn tần suất: 1 lần đăng nhập / tài khoản / IP → dưới mọi ngưỡng.
 */
setup("đăng nhập các tài khoản kiểm thử", async () => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  for (const code of ACCOUNTS) {
    const ctx = await loginApi(code);
    await ctx.storageState({ path: authFile(code) });
    await ctx.dispose();
  }
});
