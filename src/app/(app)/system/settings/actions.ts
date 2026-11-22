"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { fieldErrors, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getSettings, settingSchema } from "@/lib/settings";
import { SETTING_GROUPS, SETTING_META, settingKeysOf, type SettingGroup, type SettingKey } from "@/lib/settings-meta";
import { deleteFile, saveFile } from "@/lib/storage";
import { z } from "zod";

/**
 * Cài đặt hệ thống (Việc 28A) — CHỈ Admin tập đoàn. Mọi giá trị kiểm tra bằng zod (src/lib/settings.ts) ở server.
 * Mỗi lần đổi ghi audit SETTINGS_UPDATED { groupTitle, changed, before: {KEY: cũ}, after: {KEY: mới} }.
 */

const groupSchema = z.enum(["branding", "course", "reminder", "cleanup"]);
const groupTitle = (g: SettingGroup) => SETTING_GROUPS.find((x) => x.id === g)!.title;

type Changes = { before: Record<string, unknown>; after: Record<string, unknown> };

/** Ghi các khoá đã đổi + audit trong 1 transaction. */
async function persist(actor: CurrentUser, group: SettingGroup, values: Partial<Record<SettingKey, unknown>>, reset = false): Promise<Changes> {
  const current = await getSettings();
  const changes: Changes = { before: {}, after: {} };
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const [key, value] of Object.entries(values) as [SettingKey, unknown][]) {
    if (current[key] === value) continue;
    changes.before[key] = current[key];
    changes.after[key] = value;
    const json = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
    ops.push(prisma.systemSetting.upsert({ where: { key }, create: { key, value: json }, update: { value: json } }));
  }
  if (ops.length === 0) return changes;
  await prisma.$transaction([
    ...ops,
    logAudit(prisma, {
      actorId: actor.id,
      companyId: actor.companyId,
      action: "SETTINGS_UPDATED",
      entityType: "System",
      entityId: null,
      metadata: { groupTitle: groupTitle(group), changed: ops.length, ...(reset && { reset: true }), ...changes } as Prisma.InputJsonObject,
    }),
  ]);
  // Tên / logo / mốc hiện ở mọi trang
  revalidatePath("/", "layout");
  return changes;
}

/** Lưu 1 nhóm (trừ logo — có action riêng). */
export async function saveSettingsGroupAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const g = groupSchema.safeParse(formData.get("group"));
  if (!g.success) return { message: "Nhóm cài đặt không hợp lệ." };

  const keys = settingKeysOf(g.data).filter((k) => SETTING_META[k].kind !== "logo");
  const raw = Object.fromEntries(keys.map((k) => [k, String(formData.get(k) ?? "")]));
  const shape = Object.fromEntries(
    keys.map((k) => {
      const meta = SETTING_META[k];
      // Ô số: chuỗi rỗng / không phải số -> lỗi số (zod báo tiếng Việt)
      const schema = settingSchema(meta);
      return [k, meta.kind === "number" ? z.preprocess((v) => (String(v).trim() === "" ? undefined : Number(v)), schema) : schema];
    }),
  );
  const parsed = z.object(shape).safeParse(raw);
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: raw };

  const changes = await persist(actor, g.data, parsed.data as Partial<Record<SettingKey, unknown>>);
  const n = Object.keys(changes.after).length;
  return { ok: true, message: n ? `Đã lưu ${n} cài đặt nhóm “${groupTitle(g.data)}”.` : "Không có thay đổi." };
}

/** Khôi phục mặc định cả nhóm (nhóm Nhận diện: xoá logo đã tải lên). */
export async function resetSettingsGroupAction(group: SettingGroup): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const g = groupSchema.safeParse(group);
  if (!g.success) return { message: "Nhóm cài đặt không hợp lệ." };

  const oldLogo = g.data === "branding" ? (await getSettings()).SYSTEM_LOGO_KEY : null;
  const defaults = Object.fromEntries(settingKeysOf(g.data).map((k) => [k, SETTING_META[k].default]));
  const changes = await persist(actor, g.data, defaults, true);
  if (oldLogo && "SYSTEM_LOGO_KEY" in changes.after) await deleteFile(oldLogo);
  const n = Object.keys(changes.after).length;
  return { ok: true, message: n ? `Đã khôi phục mặc định nhóm “${groupTitle(g.data)}”.` : "Nhóm này đang dùng giá trị mặc định." };
}

/** Tải logo mới (PNG / WEBP ≤ 500KB — không nhận SVG). Thay logo cũ (xoá file cũ). */
export async function uploadLogoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) return { errors: { logo: "Vui lòng chọn ảnh logo." } };
  const saved = await saveFile(file, "branding", "logo");
  if ("error" in saved) return { errors: { logo: saved.error } };

  const oldLogo = (await getSettings()).SYSTEM_LOGO_KEY;
  await persist(actor, "branding", { SYSTEM_LOGO_KEY: saved.key });
  await deleteFile(oldLogo);
  return { ok: true, message: "Đã cập nhật logo." };
}

/** Xoá logo → dùng biểu tượng mặc định. */
export async function removeLogoAction(): Promise<ActionState> {
  const actor = await requireRole(["GROUP_ADMIN"]);
  const oldLogo = (await getSettings()).SYSTEM_LOGO_KEY;
  if (!oldLogo) return { message: "Đang dùng logo mặc định." };
  await persist(actor, "branding", { SYSTEM_LOGO_KEY: null });
  await deleteFile(oldLogo);
  return { ok: true, message: "Đã xoá logo — dùng biểu tượng mặc định." };
}
