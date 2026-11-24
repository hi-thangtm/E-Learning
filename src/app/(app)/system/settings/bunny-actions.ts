"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import {
  clearBunnyCredentials,
  getBunnySettingsView,
  rememberBunnyConnection,
  saveBunnyCredentials,
  testBunnyConnection,
  type BunnyConnectionResult,
} from "@/lib/bunny";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";

const PATH = "/system/settings";

/**
 * "Kiểm tra kết nối" Bunny Stream (Việc 31B) — CHỈ Admin tập đoàn. Gọi API danh sách video của thư viện bằng khoá đang dùng
 * (giao diện, hoặc .env). Nhật ký BUNNY_CONNECTION_TESTED chỉ ghi kết quả (không bao giờ ghi khoá).
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
  revalidatePath(PATH);
  return { ok: true, result };
}

const key = (label: string) =>
  z
    .string()
    .trim()
    .max(200, `${label} tối đa 200 ký tự.`)
    .regex(/^[^\s]*$/, `${label} không chứa khoảng trắng.`)
    .refine((v) => v === "" || v.length >= 8, `${label} quá ngắn.`);

const credentialsSchema = z.object({
  libraryId: z
    .string()
    .trim()
    .min(1, "Vui lòng nhập Library ID.")
    .regex(/^\d{1,12}$/, "Library ID chỉ gồm chữ số (VD: 123456)."),
  apiKey: key("API key"),
  tokenKey: key("Token key"),
  readonlyKey: key("Read-Only key"),
  removeReadonly: z.boolean(),
});

/**
 * Lưu khoá Bunny nhập trên giao diện — CHỈ Admin tập đoàn. Khoá mã hoá trước khi lưu, KHÔNG gửi lại về trình duyệt.
 * Ô khoá để trống = giữ khoá đã lưu. Nhật ký chỉ ghi Library ID + khoá nào được đổi (không ghi khoá).
 */
export async function saveBunnyCredentialsAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  if (!rateLimit(`bunny-cred:${actor.id}`, LIMITS.bunnyTest).ok) return { ok: false, message: RATE_LIMIT_MESSAGE };
  const values = { libraryId: String(formData.get("libraryId") ?? "") };
  const parsed = credentialsSchema.safeParse({
    libraryId: formData.get("libraryId") ?? "",
    apiKey: formData.get("apiKey") ?? "",
    tokenKey: formData.get("tokenKey") ?? "",
    readonlyKey: formData.get("readonlyKey") ?? "",
    removeReadonly: formData.get("removeReadonly") === "on",
  });
  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    return { ok: false, errors, values };
  }
  const { libraryId, apiKey, tokenKey, readonlyKey, removeReadonly } = parsed.data;
  const before = await getBunnySettingsView();
  const saved = await saveBunnyCredentials({
    libraryId,
    apiKey: apiKey || null,
    tokenKey: tokenKey || null,
    readonlyKey: readonlyKey || (removeReadonly ? "" : null),
  });
  if (!saved.ok) return { ok: false, errors: { [saved.field]: saved.message }, values };
  await logAudit(prisma, {
    actorId: actor.id,
    companyId: null,
    action: "BUNNY_CREDENTIALS_UPDATED",
    entityType: "System",
    metadata: {
      libraryId,
      apiKeyChanged: !!apiKey,
      tokenKeyChanged: !!tokenKey,
      readonlyKeyChanged: !!readonlyKey,
      readonlyKeyRemoved: !readonlyKey && removeReadonly,
      previousSource: before.source,
    },
  });
  revalidatePath(PATH);
  return { ok: true, message: "Đã lưu cấu hình Bunny Stream. Bấm “Kiểm tra kết nối” để thử." };
}

/** Xoá cấu hình nhập trên giao diện (quay về .env nếu máy chủ có BUNNY_STREAM_*). */
export async function clearBunnyCredentialsAction(): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  await clearBunnyCredentials();
  await logAudit(prisma, { actorId: actor.id, companyId: null, action: "BUNNY_CREDENTIALS_UPDATED", entityType: "System", metadata: { cleared: true } });
  revalidatePath(PATH);
  return { ok: true, message: "Đã xoá cấu hình Bunny Stream trên giao diện." };
}
