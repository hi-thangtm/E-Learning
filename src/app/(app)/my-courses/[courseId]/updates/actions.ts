"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { acknowledgeVersion } from "@/lib/acknowledgements";
import { requireUser } from "@/lib/current-user";

/** "Tôi đã đọc và nắm được" — chỉ lượt học của chính người đăng nhập. Không ghi audit (đã có acknowledgedAt). */
export async function acknowledgeVersionAction(courseId: string): Promise<{ ok: boolean; message: string }> {
  const user = await requireUser();
  const id = z.string().trim().min(1).max(50).safeParse(courseId);
  if (!id.success) return { ok: false, message: "Khoá học không hợp lệ." };

  const r = await acknowledgeVersion(user.id, id.data);
  if (!r.ok) return { ok: false, message: r.message };

  revalidatePath(`/my-courses/${id.data}`);
  revalidatePath("/my-courses");
  revalidatePath("/dashboard");
  revalidatePath("/notifications");
  return { ok: true, message: `Đã xác nhận nắm phiên bản v${r.version}.` };
}
