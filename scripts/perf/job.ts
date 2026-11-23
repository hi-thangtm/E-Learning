/**
 * Đo riêng tác vụ hằng ngày trên elearning_perf (Việc 30):   npm run perf:job
 * Lưu ý: tác vụ GHI dữ liệu (thông báo, học lại khi chứng nhận hết hạn...) — chạy lại `npm run perf:seed` nếu cần dữ liệu ban đầu.
 */
import { prisma } from "@/lib/db";
import { DAILY_JOB_PARTS, runDailyJob } from "@/lib/jobs/daily";
import { assertPerfDatabase } from "./common";

assertPerfDatabase();

async function main() {
  const t = performance.now();
  const result = await runDailyJob({ triggeredBy: null, trigger: "script" });
  const ms = performance.now() - t;
  if (!result.ok) return console.log(`• ${result.message}`);
  for (const part of DAILY_JOB_PARTS) {
    const error = result.errors[part.key];
    console.log(`${error ? "✘" : "✔"} ${part.label}: ${result.counts[part.key]}${error ? ` — LỖI: ${error}` : ""}`);
  }
  console.log(`Xong sau ${(ms / 1000).toFixed(1)} giây (mục tiêu < 120 giây).`);
}

main()
  .catch((e) => {
    console.error("✘", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
