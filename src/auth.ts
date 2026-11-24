import "server-only";
import { randomBytes } from "node:crypto";
import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getClientIp, LIMITS, rateLimit } from "@/lib/rate-limit";

/**
 * Cấu hình đăng nhập (Auth.js v5).
 *
 * - Đăng nhập bằng mã nhân viên + mật khẩu (bcrypt cost 12).
 * - KHÔNG để lộ tài khoản có tồn tại / đang bị khoá hay không (Việc 29A):
 *   luôn so mật khẩu TRƯỚC (mã không tồn tại → so với hash giả cùng cost để thời gian phản hồi như nhau);
 *   sai mật khẩu → luôn chỉ báo "invalid". Chỉ khi mật khẩu ĐÚNG mới báo khoá tạm / INACTIVE / công ty tạm ngưng.
 * - Sai 5 lần liên tiếp -> khoá tạm 15 phút. Sai mật khẩu trong lúc đang khoá tạm → "invalid", không đếm thêm.
 * - Giới hạn tần suất: 10 lần / phút / IP và 5 lần / phút / mã nhân viên (src/lib/rate-limit.ts).
 * - Phiên đăng nhập lưu trong cookie đã ký (JWT), hết hạn sau 12 giờ. Cookie chứa id người dùng + thời điểm đăng nhập (`authAt`);
 *   quyền, trạng thái và `sessionsValidAfter` được đọc lại từ database ở mỗi request (src/lib/current-user.ts)
 *   -> khoá tài khoản / đổi mật khẩu / đổi vai trò có hiệu lực ngay, phiên cũ bị huỷ.
 */

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const BCRYPT_COST = 12;

/** Hash giả tạo 1 lần lúc nạp module — so với nó khi mã nhân viên không tồn tại (chống đo thời gian để dò mã). */
const DUMMY_HASH = bcrypt.hashSync(randomBytes(24).toString("hex"), BCRYPT_COST);

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
class CompanySuspendedLoginError extends CredentialsSignin {
  code = "company_inactive";
}
class RateLimitedLoginError extends CredentialsSignin {
  code = "rate_limited";
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
      async authorize(rawCredentials, request) {
        const parsed = loginSchema.safeParse(rawCredentials);
        if (!parsed.success) throw new InvalidLoginError();

        // Quy ước: mã nhân viên luôn lưu CHỮ IN HOA
        const employeeCode = parsed.data.employeeCode.toUpperCase();

        // Giới hạn tần suất theo IP và theo mã nhân viên (kể cả mã không tồn tại)
        const ip = getClientIp(request.headers);
        if (!rateLimit(`login:ip:${ip}`, LIMITS.loginIp).ok || !rateLimit(`login:code:${employeeCode}`, LIMITS.loginCode).ok) {
          throw new RateLimitedLoginError();
        }

        const user = await prisma.user.findUnique({
          where: { employeeCode },
          include: { company: { select: { isActive: true } } },
        });

        // LUÔN so mật khẩu (mã không tồn tại → hash giả) để thời gian phản hồi như nhau
        // passwordSet = false (tài khoản tạo từ đồng bộ Lark, chưa có mật khẩu riêng) → luôn sai; vẫn chạy compare để thời gian như nhau
        const passwordOk = (await bcrypt.compare(parsed.data.password, user?.passwordHash ?? DUMMY_HASH)) && user?.passwordSet !== false;
        const now = new Date();
        const lockedNow = !!user?.lockedUntil && user.lockedUntil > now;

        if (!user || !passwordOk) {
          // Sai mật khẩu: chỉ báo "invalid". Đang khoá tạm thì không đếm thêm.
          if (user && !lockedNow) {
            const failed = user.failedLoginCount + 1;
            const shouldLock = failed >= MAX_FAILED_LOGINS;
            await prisma.user.update({
              where: { id: user.id },
              data: {
                failedLoginCount: shouldLock ? 0 : failed,
                lockedUntil: shouldLock ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null,
              },
            });
          }
          throw new InvalidLoginError();
        }

        // Mật khẩu ĐÚNG → mới báo tình trạng tài khoản
        if (lockedNow) throw new LockedLoginError();
        if (user.status !== "ACTIVE") throw new InactiveLoginError();
        // Công ty bị tạm ngưng -> nhân viên của công ty đó không đăng nhập được (dữ liệu giữ nguyên)
        if (!user.company.isActive) throw new CompanySuspendedLoginError();

        await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now },
        });

        return { id: user.id, name: user.fullName };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      // Thời điểm cấp phiên (claim riêng — không dùng `iat` vì Auth.js ký lại token khi gia hạn).
      // So với users.sessionsValidAfter để huỷ phiên cũ (src/lib/current-user.ts).
      if (user) token.authAt = Date.now();
      return token;
    },
    session({ session, token }) {
      if (token.sub && session.user) session.user.id = token.sub;
      session.authAt = typeof token.authAt === "number" ? token.authAt : 0;
      return session;
    },
  },
});
