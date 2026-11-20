"use server";

import { AuthError } from "next-auth";
import { signIn } from "@/auth";

export type LoginState = { error?: string; employeeCode?: string };

const MESSAGES: Record<string, string> = {
  invalid: "Mã nhân viên hoặc mật khẩu không đúng.",
  locked: "Bạn đã nhập sai quá nhiều lần. Tài khoản tạm khoá 15 phút.",
  inactive: "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị đào tạo.",
};

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const employeeCode = String(formData.get("employeeCode") ?? "");

  try {
    // Thành công: signIn tự chuyển trang (ném lệnh redirect nội bộ của Next.js)
    await signIn("credentials", {
      employeeCode,
      password: String(formData.get("password") ?? ""),
      redirectTo: "/dashboard",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      const code = "code" in error && typeof error.code === "string" ? error.code : "";
      return { error: MESSAGES[code] ?? MESSAGES.invalid, employeeCode };
    }
    // Không phải lỗi đăng nhập (vd. lệnh redirect khi thành công) -> ném tiếp
    throw error;
  }
}
