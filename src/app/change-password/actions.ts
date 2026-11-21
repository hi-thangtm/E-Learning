"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/current-user";
import { logAudit } from "@/lib/audit";

export type ChangePasswordState = { error?: string };

const schema = z
  .object({
    currentPassword: z.string().min(1, "Vui lòng nhập mật khẩu hiện tại."),
    newPassword: z
      .string()
      .min(8, "Mật khẩu mới tối thiểu 8 ký tự.")
      .max(100, "Mật khẩu mới tối đa 100 ký tự.")
      .regex(/[A-Za-z]/, "Mật khẩu mới phải có ít nhất 1 chữ cái.")
      .regex(/\d/, "Mật khẩu mới phải có ít nhất 1 chữ số."),
    confirmPassword: z.string(),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Xác nhận mật khẩu không khớp.",
    path: ["confirmPassword"],
  })
  .refine((d) => d.newPassword !== d.currentPassword, {
    message: "Mật khẩu mới phải khác mật khẩu hiện tại.",
    path: ["newPassword"],
  });

export async function changePasswordAction(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const user = await requireUser({ allowMustChangePassword: true });

  const parsed = schema.safeParse({
    currentPassword: formData.get("currentPassword") ?? "",
    newPassword: formData.get("newPassword") ?? "",
    confirmPassword: formData.get("confirmPassword") ?? "",
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };

  const record = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  const currentOk = record && (await bcrypt.compare(parsed.data.currentPassword, record.passwordHash));
  if (!currentOk) return { error: "Mật khẩu hiện tại không đúng." };

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

  // Đổi mật khẩu + ghi nhật ký trong cùng 1 transaction
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    }),
    logAudit(prisma, {
        actorId: user.id,
        companyId: user.companyId,
        action: "USER_PASSWORD_CHANGED",
        entityType: "User",
        entityId: user.id,
      }),
  ]);

  redirect("/dashboard");
}
