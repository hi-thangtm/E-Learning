import type { ZodError } from "zod";

/**
 * Kết quả trả về chung của server action dùng với useActionState / ConfirmDialog.
 * - ok: true khi thành công (form tự đóng + toast)
 * - message: thông báo tiếng Việt (toast)
 * - errors: lỗi theo từng ô, key = name của ô nhập
 * - values: dữ liệu vừa gửi — React 19 tự reset form sau khi action chạy xong, nên khi có lỗi
 *   trả lại values và dùng làm defaultValue để người dùng không phải nhập lại.
 */
export type ActionState = {
  ok?: boolean;
  message?: string;
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

/** Lấy các ô dạng chuỗi từ FormData (để trả lại trong ActionState.values). */
export function formValues(formData: FormData, keys: string[]): Record<string, string> {
  const values: Record<string, string> = {};
  for (const key of keys) {
    const v = formData.get(key);
    values[key] = typeof v === "string" ? v : "";
  }
  return values;
}

export const initialActionState: ActionState = {};

/** Chuyển lỗi zod thành { tênÔ: lỗi đầu tiên }. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "_form");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}
