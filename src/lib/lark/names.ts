import "server-only";
import { prisma } from "@/lib/db";

/**
 * Tên phòng ban Lark đã ghép với công ty (open_department_id → tên) — để trang Kết nối Lark hiện tên mà không phải gọi Lark mỗi lần mở.
 * Lưu ở system_settings (khoá riêng, không nằm trong form Cài đặt).
 */
const KEY = "LARK_MAPPING_NAMES";

export async function getLarkNames(): Promise<Record<string, string>> {
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY }, select: { value: true } });
  const v = row?.value;
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
}

/** Gộp thêm tên (giữ tên cũ để hiện “từ … → …” trong nhật ký). Trả về bản đã gộp. */
export async function saveLarkNames(add: Record<string, string>): Promise<Record<string, string>> {
  const merged = { ...(await getLarkNames()), ...add };
  if (Object.keys(add).length > 0) {
    await prisma.systemSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: merged }, update: { value: merged } });
  }
  return merged;
}
