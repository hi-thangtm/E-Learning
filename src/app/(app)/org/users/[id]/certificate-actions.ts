"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { revokeCertificate } from "@/lib/certificates";
import { requireRole } from "@/lib/current-user";

/** Thu hồi chứng nhận — Admin tập đoàn / Admin công ty (người công ty mình). Bắt buộc lý do; ghi audit CERTIFICATE_REVOKED. */
export async function revokeCertificateAction(certificateId: string, reason: string): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const id = z.string().trim().min(1).max(50).safeParse(certificateId);
  if (!id.success) return { message: "Không xác định được chứng nhận." };
  const note = z.string().trim().min(5, "Lý do tối thiểu 5 ký tự.").max(500, "Lý do tối đa 500 ký tự.").safeParse(reason ?? "");
  if (!note.success) return { errors: { reason: note.error.issues[0].message } };

  const r = await revokeCertificate(id.data, actor, note.data);
  if (!r.ok) return { message: r.message };
  revalidatePath("/org/users");
  return { ok: true, message: "Đã thu hồi chứng nhận." };
}
