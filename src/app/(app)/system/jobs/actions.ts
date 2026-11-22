"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/current-user";
import { runDailyJob, type DailyJobResult } from "@/lib/jobs/daily";

/** "Chạy ngay" tác vụ hằng ngày — chỉ Admin tập đoàn. Tác vụ tự ghi audit_logs JOB_DAILY_RUN. */
export async function runDailyJobAction(): Promise<DailyJobResult> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const result = await runDailyJob({ triggeredBy: actor.id, trigger: "manual" });
  revalidatePath("/system/jobs");
  return result;
}
