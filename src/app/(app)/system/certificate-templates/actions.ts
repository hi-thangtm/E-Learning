"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { deleteFile, saveFile } from "@/lib/storage";

/**
 * Mẫu chứng nhận của 1 công ty (logo, người ký, chức vụ, ảnh chữ ký) — lưu vào các cột của Company.
 * Admin công ty: chỉ công ty mình. Admin tập đoàn: mọi công ty. Chỉ áp dụng cho chứng nhận cấp SAU khi lưu (đã cấp giữ snapshot).
 */

const MAX_IMAGE_BYTES = 1024 * 1024;
const FIELDS = ["signerName", "signerTitle"];

const textSchema = z.object({
  signerName: z.string().trim().max(100, "Tên người ký tối đa 100 ký tự.").transform((v) => v || null),
  signerTitle: z.string().trim().max(150, "Chức vụ tối đa 150 ký tự.").transform((v) => v || null),
});

export async function updateCertificateTemplateAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);

  // Admin công ty luôn sửa công ty mình (bỏ qua giá trị gửi lên)
  const companyId = actor.role === "GROUP_ADMIN" ? String(formData.get("companyId") ?? "") : actor.companyId;
  const company = await prisma.company.findUnique({
    where: { id: companyId.slice(0, 50) },
    select: {
      id: true,
      code: true,
      logoUrl: true,
      certificateSignerName: true,
      certificateSignerTitle: true,
      certificateSignatureUrl: true,
    },
  });
  if (!company) return { message: "Không tìm thấy công ty hoặc bạn không có quyền." };

  const fail = (errors: Record<string, string>): ActionState => ({ errors, values: formValues(formData, FIELDS) });
  const parsed = textSchema.safeParse({
    signerName: String(formData.get("signerName") ?? ""),
    signerTitle: String(formData.get("signerTitle") ?? ""),
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const i of parsed.error.issues) errors[String(i.path[0])] ??= i.message;
    return fail(errors);
  }

  // Kiểm tra dung lượng trước khi lưu file (giới hạn riêng 1MB)
  const files = { logo: formData.get("logo"), signature: formData.get("signature") };
  for (const [key, file] of Object.entries(files)) {
    if (file instanceof File && file.size > MAX_IMAGE_BYTES) return fail({ [key]: "Ảnh tối đa 1MB." });
  }

  const saved: string[] = [];
  /** Lưu ảnh mới (nếu có) vào companies/<id>/ — kiểm tra loại file theo nội dung. */
  async function save(file: FormDataEntryValue | null): Promise<{ key: string | null } | { error: string }> {
    if (!(file instanceof File) || file.size === 0) return { key: null };
    const r = await saveFile(file, `companies/${company!.id}`, "image");
    if ("error" in r) return { error: r.error };
    saved.push(r.key);
    return { key: r.key };
  }
  const newLogo = await save(files.logo);
  if ("error" in newLogo) return fail({ logo: newLogo.error });
  const newSignature = await save(files.signature);
  if ("error" in newSignature) {
    for (const k of saved) await deleteFile(k);
    return fail({ signature: newSignature.error });
  }

  const logoUrl = newLogo.key ?? (formData.get("removeLogo") === "1" ? null : company.logoUrl);
  const signatureUrl = newSignature.key ?? (formData.get("removeSignature") === "1" ? null : company.certificateSignatureUrl);

  const next = {
    logoUrl,
    certificateSignerName: parsed.data.signerName,
    certificateSignerTitle: parsed.data.signerTitle,
    certificateSignatureUrl: signatureUrl,
  };
  const changedFields = (Object.keys(next) as (keyof typeof next)[]).filter((k) => next[k] !== company[k]);
  if (changedFields.length === 0) return { ok: true, message: "Không có thay đổi nào." };

  try {
    await prisma.$transaction([
      prisma.company.update({ where: { id: company.id }, data: next }),
      logAudit(prisma, {
        actorId: actor.id,
        companyId: company.id,
        action: "CERTIFICATE_TEMPLATE_UPDATED",
        entityType: "Company",
        entityId: company.id,
        metadata: {
          companyCode: company.code,
          changedFields,
          before: { certificateSignerName: company.certificateSignerName, certificateSignerTitle: company.certificateSignerTitle },
          after: { certificateSignerName: next.certificateSignerName, certificateSignerTitle: next.certificateSignerTitle },
        },
      }),
    ]);
  } catch (error) {
    for (const k of saved) await deleteFile(k);
    throw error;
  }

  // Ảnh cũ bị thay / bỏ: chỉ xoá khi không chứng nhận đã cấp nào còn dùng (snapshot giữ key cũ)
  for (const old of [company.logoUrl, company.certificateSignatureUrl]) {
    if (!old || old === logoUrl || old === signatureUrl) continue;
    const inUse = await prisma.certificate.findFirst({
      where: {
        OR: [
          { templateSnapshot: { path: ["logoKey"], equals: old } },
          { templateSnapshot: { path: ["signatureKey"], equals: old } },
        ],
      },
      select: { id: true },
    });
    if (!inUse) await deleteFile(old);
  }

  revalidatePath("/system/certificate-templates");
  return { ok: true, message: `Đã lưu mẫu chứng nhận của ${company.code}. Áp dụng cho chứng nhận cấp từ bây giờ.` };
}
