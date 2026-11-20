import { cache } from "react";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

/**
 * Lấy người dùng đang đăng nhập — đọc lại từ database ở mỗi request.
 *
 * Trả về null nếu: chưa đăng nhập, tài khoản không còn, đã bị khoá (INACTIVE),
 * hoặc công ty của người đó đang tạm ngưng.
 * `cache` giúp trong cùng 1 request chỉ truy vấn 1 lần dù gọi ở nhiều chỗ.
 */
export const getCurrentUser = cache(async () => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      avatarUrl: true,
      role: true,
      status: true,
      mustChangePassword: true,
      companyId: true,
      departmentId: true,
      positionId: true,
      company: { select: { id: true, code: true, name: true, parentId: true, isActive: true } },
    },
  });

  // Công ty bị tạm ngưng -> phiên đang mở cũng mất hiệu lực ở request kế tiếp
  if (!user || user.status !== "ACTIVE" || !user.company.isActive) return null;
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/**
 * Bắt buộc đã đăng nhập. Dùng ở đầu MỌI trang và server action cần bảo vệ.
 * - Chưa đăng nhập -> chuyển về /login
 * - Chưa đổi mật khẩu lần đầu -> chuyển về /change-password
 */
export async function requireUser(options?: { allowMustChangePassword?: boolean }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !options?.allowMustChangePassword) redirect("/change-password");
  return user;
}

/** Bắt buộc có một trong các vai trò. Không đủ quyền -> về trang Tổng quan. */
export async function requireRole(roles: Role[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
