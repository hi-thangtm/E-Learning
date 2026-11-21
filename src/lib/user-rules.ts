import { z } from "zod";

/**
 * Quy tắc dữ liệu người dùng dùng chung cho form (org/users/actions.ts) và import Excel
 * (org/users/import). Sửa ở đây để hai nơi luôn kiểm tra giống nhau.
 */

/** Mã nhân viên (đã chuyển in hoa): chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới, 2–30 ký tự. */
export const EMPLOYEE_CODE_REGEX = /^[A-Z0-9_.-]{2,30}$/;
export const EMPLOYEE_CODE_MESSAGE =
  "Mã nhân viên chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới (2–30 ký tự).";

export const FULL_NAME_MIN = 2;
export const FULL_NAME_MAX = 100;
export const EMAIL_MAX = 150;

export const PHONE_REGEX = /^\+?[0-9 .()-]{8,20}$/;
export const PHONE_MESSAGE = "Số điện thoại không hợp lệ (8–20 chữ số).";

export function isValidEmail(value: string): boolean {
  return value.length <= EMAIL_MAX && z.email().safeParse(value).success;
}

/** Ngày vào làm dạng yyyy-MM-dd: ngày có thật, trong khoảng 1950 → hôm nay + 1 năm. */
export function isValidHireDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return date.getUTCFullYear() >= 1950 && date.getTime() <= Date.now() + 366 * 24 * 3600 * 1000;
}

/** Cột @db.Date: lưu nửa đêm UTC để không lệch ngày. */
export function toDbDate(value: string | null): Date | null {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export function fromDbDate(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}
