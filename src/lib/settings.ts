import "server-only";
import { cache } from "react";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SETTING_KEYS, SETTING_META, type SettingKey, type SettingMeta, type SettingValues } from "@/lib/settings-meta";
import { isValidKey } from "@/lib/storage";

/**
 * Cài đặt hệ thống (bảng system_settings, Admin tập đoàn sửa ở /system/settings). CHỈ chạy ở server.
 * Danh sách khoá / mặc định / giới hạn: src/lib/settings-meta.ts. Giá trị thiếu hoặc sai kiểu -> dùng mặc định.
 */

export { SETTING_META, SETTING_KEYS, type SettingKey, type SettingValues } from "@/lib/settings-meta";

/** Schema zod của 1 khoá (dùng khi đọc DB và khi lưu từ form). Thông báo lỗi tiếng Việt. */
export function settingSchema(meta: SettingMeta) {
  switch (meta.kind) {
    case "number":
      return z
        .number(`${meta.label} phải là số.`)
        .int(`${meta.label} phải là số nguyên.`)
        .min(meta.min, `${meta.label} từ ${meta.min} đến ${meta.max} ${meta.unit}.`)
        .max(meta.max, `${meta.label} từ ${meta.min} đến ${meta.max} ${meta.unit}.`);
    case "string":
      return z
        .string()
        .trim()
        .transform((v) => v.replace(/\s+/g, " "))
        .pipe(
          z
            .string()
            .min(meta.minLength, `${meta.label} tối thiểu ${meta.minLength} ký tự.`)
            .max(meta.maxLength, `${meta.label} tối đa ${meta.maxLength} ký tự.`),
        );
    case "logo":
      return z
        .string()
        .refine((v) => isValidKey(v) && v.startsWith("branding/") && /\.(png|webp)$/.test(v), "Logo không hợp lệ.")
        .nullable();
  }
}

/** Đọc mọi cài đặt — 1 truy vấn / request (React cache). Khoá thiếu / sai kiểu -> mặc định. */
export const getSettings = cache(async (): Promise<SettingValues> => {
  const rows = await prisma.systemSetting.findMany({ where: { key: { in: SETTING_KEYS } }, select: { key: true, value: true } });
  const stored = new Map(rows.map((r) => [r.key, r.value]));
  const values = {} as Record<SettingKey, unknown>;
  for (const key of SETTING_KEYS) {
    const meta = SETTING_META[key];
    const parsed = stored.has(key) ? settingSchema(meta).safeParse(stored.get(key)) : null;
    values[key] = parsed?.success ? parsed.data : meta.default;
  }
  return values as SettingValues;
});

/** 1 cài đặt, đúng kiểu. */
export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
  return (await getSettings())[key];
}

/** Tên + logo hệ thống (sidebar, trang đăng nhập, /verify, metadata). */
export async function getBranding(): Promise<{ name: string; logoKey: string | null }> {
  const s = await getSettings();
  return { name: s.SYSTEM_NAME, logoKey: s.SYSTEM_LOGO_KEY };
}
