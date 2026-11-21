import { prisma } from "@/lib/db";

/**
 * Đọc cài đặt hệ thống (bảng system_settings, Admin tập đoàn sửa ở mục 6.4).
 * Giá trị sai kiểu / thiếu -> dùng giá trị mặc định truyền vào.
 */
export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const row = await prisma.systemSetting.findUnique({ where: { key }, select: { value: true } });
  const value = row?.value;
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
