import { z } from "zod";

/** Quy tắc dữ liệu khoá học dùng chung (tạo mới + tab Thông tin). */

export const COURSE_CODE_REGEX = /^[A-Z0-9_.-]{2,30}$/;

export const courseCodeSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập mã khoá học.")
  .transform((v) => v.toUpperCase())
  .pipe(
    z
      .string()
      .regex(
        COURSE_CODE_REGEX,
        "Mã chỉ gồm chữ in hoa không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới (2–30 ký tự). VD: QT-BH-01",
      ),
  );

export const courseTitleSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, " "))
  .pipe(z.string().min(3, "Tên khoá học tối thiểu 3 ký tự.").max(200, "Tên khoá học tối đa 200 ký tự."));

/** Id tuỳ chọn: chuỗi rỗng -> null */
export const optionalIdSchema = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? null : v));
