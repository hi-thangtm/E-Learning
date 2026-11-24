"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  clearLarkCredentials,
  getLarkSettingsView,
  LarkApiError,
  LarkNotConfiguredError,
  saveLarkCredentials,
  testLarkConnection,
  type LarkConnectionResult,
} from "@/lib/lark/client";
import { fetchLarkDepartments } from "@/lib/lark/directory";
import { saveLarkNames } from "@/lib/lark/names";
import { applyLarkSync, planLarkSync, type LarkPlan } from "@/lib/lark/sync";
import { LIMITS, RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";

const PATH = "/system/lark";

function larkError(e: unknown): string {
  if (e instanceof LarkNotConfiguredError) return e.message;
  if (e instanceof LarkApiError) return `Lỗi gọi Lark: ${e.message}`;
  return "Không gọi được Lark, vui lòng thử lại.";
}

const credentialsSchema = z.object({
  appId: z
    .string()
    .trim()
    .min(4, "Vui lòng nhập App ID.")
    .max(64, "App ID tối đa 64 ký tự.")
    .regex(/^[A-Za-z0-9_-]+$/, "App ID chỉ gồm chữ, số, dấu _ và - (VD: cli_a1b2c3d4e5f6)."),
  appSecret: z.string().trim().max(128, "App Secret tối đa 128 ký tự.").regex(/^[^\s]*$/, "App Secret không chứa khoảng trắng."),
  domain: z.enum(["larksuite", "feishu"], { error: "Chọn máy chủ Lark." }),
});

/**
 * Lưu App ID / App Secret / máy chủ nhập trên giao diện (mã hoá secret, KHÔNG gửi lại về trình duyệt).
 * Để trống App Secret = giữ secret đã lưu. Ghi audit LARK_CREDENTIALS_UPDATED (không có secret).
 */
export async function saveLarkCredentialsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`lark-cred:${actor.id}`, LIMITS.larkTest).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const parsed = credentialsSchema.safeParse({
    appId: formData.get("appId") ?? "",
    appSecret: formData.get("appSecret") ?? "",
    domain: formData.get("domain") ?? "",
  });
  const values = { appId: String(formData.get("appId") ?? ""), domain: String(formData.get("domain") ?? "") };
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors, values };
  }
  const { appId, appSecret, domain } = parsed.data;
  if (appSecret && appSecret.length < 8) return { ok: false, errors: { appSecret: "App Secret quá ngắn." }, values };
  const before = await getLarkSettingsView();
  const saved = await saveLarkCredentials({ appId, domain, secret: appSecret || null });
  if (!saved.ok) return { ok: false, errors: { appSecret: saved.message }, values };
  await logAudit(prisma, {
    actorId: actor.id,
    companyId: null,
    action: "LARK_CREDENTIALS_UPDATED",
    entityType: "System",
    metadata: { appId, domain, secretChanged: !!appSecret, previousSource: before.source },
  });
  revalidatePath(PATH);
  return { ok: true, message: "Đã lưu cấu hình Lark. Bấm “Kiểm tra kết nối” để thử." };
}

/** Xoá cấu hình nhập trên giao diện (quay về .env nếu máy chủ có LARK_*). */
export async function clearLarkCredentialsAction(): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  await clearLarkCredentials();
  await logAudit(prisma, { actorId: actor.id, companyId: null, action: "LARK_CREDENTIALS_UPDATED", entityType: "System", metadata: { cleared: true } });
  revalidatePath(PATH);
  return { ok: true, message: "Đã xoá cấu hình Lark trên giao diện." };
}

/** "Kiểm tra kết nối" — chỉ Admin tập đoàn. */
export async function testLarkConnectionAction(): Promise<{ ok: true; result: LarkConnectionResult } | { ok: false; message: string }> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`lark-test:${actor.id}`, LIMITS.larkTest).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };
  return { ok: true, result: await testLarkConnection() };
}

export type LarkTreeNode = { openId: string; name: string; parentOpenId: string };

/** Cây phòng ban Lark để chọn phòng gốc cho công ty. */
export async function loadLarkTreeAction(): Promise<{ ok: true; departments: LarkTreeNode[] } | { ok: false; message: string }> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`lark-tree:${actor.id}`, LIMITS.larkSync).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };
  try {
    const departments = await fetchLarkDepartments();
    return { ok: true, departments: departments.map((d) => ({ openId: d.openId, name: d.name, parentOpenId: d.parentOpenId })) };
  } catch (e) {
    return { ok: false, message: larkError(e) };
  }
}

const mappingSchema = z.object({
  companyId: z.string().min(1).max(50),
  openId: z.string().trim().min(1).max(100).nullable(),
});

/**
 * Ghép 1 công ty với 1 phòng ban gốc trên Lark (openId = null → bỏ ghép).
 * Không cho 2 công ty cùng 1 phòng, hoặc phòng của công ty này nằm trong / chứa phòng của công ty khác.
 */
export async function saveLarkMappingAction(companyId: string, openId: string | null): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const parsed = mappingSchema.safeParse({ companyId, openId });
  if (!parsed.success) return { ok: false, message: "Dữ liệu không hợp lệ." };
  if (!rateLimit(`lark-map:${actor.id}`, LIMITS.larkSync).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };

  const company = await prisma.company.findUnique({ where: { id: parsed.data.companyId }, select: { id: true, code: true, larkDepartmentId: true } });
  if (!company) return { ok: false, message: "Không tìm thấy công ty." };
  const target = parsed.data.openId;
  if (target === company.larkDepartmentId) return { ok: true, message: "Không có thay đổi nào." };

  let toName: string | null = null;
  if (target) {
    let departments;
    try {
      departments = await fetchLarkDepartments();
    } catch (e) {
      return { ok: false, message: larkError(e) };
    }
    const byId = new Map(departments.map((d) => [d.openId, d]));
    const dept = byId.get(target);
    if (!dept) return { ok: false, message: "Phòng ban không còn trên Lark — tải lại cây phòng ban." };
    toName = dept.name;
    const ancestors = (id: string) => {
      const out = new Set<string>();
      for (let cur = byId.get(id)?.parentOpenId; cur && cur !== "0" && !out.has(cur); cur = byId.get(cur)?.parentOpenId) out.add(cur);
      return out;
    };
    const others = await prisma.company.findMany({ where: { id: { not: company.id }, larkDepartmentId: { not: null } }, select: { code: true, larkDepartmentId: true } });
    const targetAncestors = ancestors(target);
    for (const o of others) {
      const other = o.larkDepartmentId!;
      if (other === target) return { ok: false, message: `Phòng ban này đã ghép với công ty ${o.code}.` };
      if (targetAncestors.has(other)) return { ok: false, message: `Phòng ban này nằm trong nhánh đã ghép với công ty ${o.code}.` };
      if (ancestors(other).has(target)) return { ok: false, message: `Phòng ban này chứa nhánh đã ghép với công ty ${o.code}.` };
    }
  }

  const names = await saveLarkNames(target && toName ? { [target]: toName } : {});
  const fromName = company.larkDepartmentId ? (names[company.larkDepartmentId] ?? company.larkDepartmentId) : null;
  await prisma.$transaction([
    prisma.company.update({ where: { id: company.id }, data: { larkDepartmentId: target } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: company.id,
      action: "LARK_MAPPING_UPDATED",
      entityType: "Company",
      entityId: company.id,
      metadata: { companyCode: company.code, from: company.larkDepartmentId, to: target, fromName, toName },
    }),
  ]);
  revalidatePath(PATH);
  return { ok: true, message: target ? `Đã ghép ${company.code} với “${toName}”.` : `Đã bỏ ghép ${company.code}.` };
}

/** Chạy thử: tính kế hoạch đồng bộ (không ghi gì). */
export async function previewLarkSyncAction(): Promise<{ ok: true; plan: LarkPlan } | { ok: false; message: string }> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`lark-sync:${actor.id}`, LIMITS.larkSync).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };
  if ((await prisma.company.count({ where: { larkDepartmentId: { not: null } } })) === 0) {
    return { ok: false, message: "Chưa ghép công ty nào với phòng ban Lark." };
  }
  try {
    return { ok: true, plan: await planLarkSync() };
  } catch (e) {
    return { ok: false, message: larkError(e) };
  }
}

const applySchema = z.object({ fingerprint: z.string().regex(/^[0-9a-f]{32}$/), force: z.boolean() });

/**
 * Áp dụng: server TÍNH LẠI kế hoạch (không nhận kế hoạch từ trình duyệt) và chỉ ghi khi trùng dấu vân tay của lần chạy thử
 * → bắt buộc chạy thử trước mỗi lần áp dụng. Chạm chốt chặn → cần force (“Tôi đã kiểm tra, vẫn áp dụng”).
 */
export async function applyLarkSyncAction(fingerprint: string, force: boolean): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const parsed = applySchema.safeParse({ fingerprint, force });
  if (!parsed.success) return { ok: false, message: "Hãy chạy thử trước khi áp dụng." };
  if (!rateLimit(`lark-sync:${actor.id}`, LIMITS.larkSync).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };

  let plan: LarkPlan;
  try {
    plan = await planLarkSync();
  } catch (e) {
    return { ok: false, message: larkError(e) };
  }
  if (plan.fingerprint !== parsed.data.fingerprint) {
    return { ok: false, message: "Dữ liệu Lark hoặc E-Learning đã thay đổi sau lần chạy thử — hãy chạy thử lại rồi áp dụng." };
  }
  if (plan.guard.tripped && !parsed.data.force) {
    return { ok: false, message: `Kế hoạch khoá ${plan.guard.lock} người — tick “Tôi đã kiểm tra, vẫn áp dụng” để tiếp tục.` };
  }
  const result = await applyLarkSync(plan, { actorId: actor.id, trigger: "manual", force: parsed.data.force });
  revalidatePath(PATH);
  revalidatePath("/org/users");
  if (!result.ok) return { ok: false, message: result.message };
  const c = result.counts;
  return { ok: true, message: `Đã đồng bộ: tạo ${c.create}, cập nhật ${c.update}, chuyển công ty ${c.transfer}, khoá ${c.lock}, mở lại ${c.reopen}.` };
}
