"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { rememberBunnyConnection, testBunnyConnection, type BunnyConnectionResult } from "@/lib/bunny";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

/**
 * "Kiểm tra kết nối" Bunny Stream (Việc 31B) — CHỈ Admin tập đoàn. Gọi API danh sách video của thư viện bằng khoá trong .env.
 * Nhật ký BUNNY_CONNECTION_TESTED chỉ ghi kết quả (không bao giờ ghi khoá).
 */
export async function testBunnyConnectionAction(): Promise<{ ok: true; result: BunnyConnectionResult } | { ok: false; message: string }> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`bunny-test:${actor.id}`, LIMITS.bunnyTest).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };

  const result = await testBunnyConnection();
  rememberBunnyConnection(result);
  await logAudit(prisma, {
    actorId: actor.id,
    companyId: actor.companyId,
    action: "BUNNY_CONNECTION_TESTED",
    entityType: "System",
    metadata: { result: result.status, ...(result.status === "ok" && { videoCount: result.videoCount }) },
  });
  revalidatePath("/system/settings");
  return { ok: true, result };
}
