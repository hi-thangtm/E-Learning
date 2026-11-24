/**
 * Đồng bộ Lark từ dòng lệnh (Việc L1):   npm run job:lark-sync           → tính + áp dụng (chốt chặn bắt buộc)
 *                                         npm run job:lark-sync -- --dry  → chỉ chạy thử, in tổng hợp
 * Dùng cùng logic với nút trên trang /system/lark và bước “Đồng bộ Lark” của tác vụ hằng ngày. Ghi audit LARK_SYNC_RUN (trigger "script").
 */
import { prisma } from "@/lib/db";
import { isLarkConfigured } from "@/lib/lark/client";
import { applyLarkSync, planLarkSync, type LarkPlan } from "@/lib/lark/sync";

function printPlan(plan: LarkPlan) {
  const c = plan.counts;
  console.log(`Lark: ${plan.larkDepartments} phòng ban, ${plan.larkUsers} nhân viên.`);
  console.log(`Tạo ${c.create} · cập nhật ${c.update} · chuyển công ty ${c.transfer} · khoá ${c.lock} · mở lại ${c.reopen} · bỏ qua ${c.skipped} · chỉ có ở E-Learning ${c.localOnly}`);
  console.log(`Phòng ban thay đổi ${c.departments} · trưởng phòng thay đổi ${c.managers}`);
  if (plan.guard.tripped) console.log(`⚠ Chạm chốt chặn: khoá ${plan.guard.lock} / ${plan.guard.active} người đang hoạt động.`);
  for (const w of plan.warnings.slice(0, 20)) console.log(`  ! ${w}`);
}

async function main() {
  if (!(await isLarkConfigured())) {
    console.log("✘ Chưa cấu hình Lark (nhập ở Hệ thống › Kết nối Lark, hoặc LARK_APP_ID / LARK_APP_SECRET trong .env).");
    process.exitCode = 1;
    return;
  }
  console.log("Đang đọc danh bạ Lark...");
  const plan = await planLarkSync();
  printPlan(plan);
  if (process.argv.includes("--dry")) return;
  const result = await applyLarkSync(plan, { actorId: null, trigger: "script" });
  if (!result.ok) {
    console.log(`✘ Không áp dụng: ${result.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`✔ Đã áp dụng sau ${result.durationMs} ms.`);
}

main()
  .catch((error) => {
    console.error("✘ Đồng bộ lỗi:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
