/**
 * Chạy tay tác vụ hằng ngày ở máy dev:   npm run job:daily
 * (tsx đọc .env bằng --env-file và hiểu alias "@/..." trong tsconfig.json)
 */
import { prisma } from "@/lib/db";
import { DAILY_JOB_PARTS, runDailyJob } from "@/lib/jobs/daily";

async function main() {
  console.log("Đang chạy tác vụ hằng ngày...");
  const result = await runDailyJob({ triggeredBy: null, trigger: "script" });
  if (!result.ok) {
    console.log(`• ${result.message}`);
    return;
  }
  for (const part of DAILY_JOB_PARTS) {
    const error = result.errors[part.key];
    console.log(`${error ? "✘" : "✔"} ${part.label}: ${result.counts[part.key]}${error ? ` — LỖI: ${error}` : ""}`);
  }
  console.log(`Xong sau ${result.durationMs} ms.`);
}

main()
  .catch((error) => {
    console.error("✘ Tác vụ lỗi:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
