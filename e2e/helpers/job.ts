import { request } from "@playwright/test";
import { BASE_URL, testEnv } from "./env";

/** Chạy tác vụ hằng ngày qua POST /api/jobs/daily với CRON_SECRET của .env.test (trong chính app đang chạy). */
export async function runDailyJob(): Promise<{ ok: boolean; counts?: Record<string, number>; message?: string }> {
  const ctx = await request.newContext({ baseURL: BASE_URL });
  try {
    // Chỉ 1 lượt chạy mỗi lúc (khoá advisory) — 409 thì thử lại
    for (let i = 0; i < 10; i++) {
      const res = await ctx.post("/api/jobs/daily", { headers: { Authorization: `Bearer ${testEnv.CRON_SECRET}` } });
      if (res.status() !== 409) return (await res.json()) as { ok: boolean; counts?: Record<string, number> };
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw new Error("Tác vụ hằng ngày đang chạy ở nơi khác quá lâu");
  } finally {
    await ctx.dispose();
  }
}
