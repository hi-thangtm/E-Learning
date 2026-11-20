import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";

/**
 * Cấu hình đăng nhập (Auth.js v5).
 *
 * - Đăng nhập bằng mã nhân viên + mật khẩu (bcrypt).
 * - Sai 5 lần liên tiếp -> khoá tạm 15 phút.
 * - Tài khoản INACTIVE (nghỉ việc / bị khoá) không đăng nhập được.
 * - Phiên đăng nhập lưu trong cookie đã ký (JWT), hết hạn sau 12 giờ.
 *   Cookie chỉ chứa id người dùng; quyền và trạng thái được đọc lại từ database
 *   ở mỗi request (xem src/lib/current-user.ts) -> khoá tài khoản có hiệu lực ngay.
 */

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

// Mỗi lỗi có "code" riêng để trang đăng nhập hiện đúng thông báo
class InvalidLoginError extends CredentialsSignin {
  code = "invalid";
}
class LockedLoginError extends CredentialsSignin {
  code = "locked";
}
class InactiveLoginError extends CredentialsSignin {
  code = "inactive";
}

const loginSchema = z.object({
  employeeCode: z.string().trim().min(1).max(50),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        employeeCode: { label: "Mã nhân viên" },
        password: { label: "Mật khẩu", type: "password" },
      },
      async authorize(rawCredentials) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) throw new InvalidLoginError();

        // Quy ước: mã nhân viên luôn lưu CHỮ IN HOA
        const employeeCode = parsed.data.employeeCode.toUpperCase();
        const user = await prisma.user.findUnique({ where: { employeeCode } });
        if (!user) throw new InvalidLoginError();

        if (user.status !== "ACTIVE") throw new InactiveLoginError();
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new LockedLoginError();

        const passwordOk = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!passwordOk) {
          const failed = user.failedLoginCount + 1;
          const shouldLock = failed >= MAX_FAILED_LOGINS;
          await prisma.user.update({
            where: { id: user.id },
            data: {
              failedLoginCount: shouldLock ? 0 : failed,
              lockedUntil: shouldLock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : null,
            },
          });
          throw shouldLock ? new LockedLoginError() : new InvalidLoginError();
        }

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
        });

        return { id: user.id, name: user.fullName };
      },
    }),
  ],
  callbacks: {
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      return session;
    },
  },
});
