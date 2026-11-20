import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/current-user";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

export default async function ChangePasswordPage() {
  const user = await requireUser({ allowMustChangePassword: true });

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/40 p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Đổi mật khẩu</CardTitle>
          <CardDescription>
            {user.mustChangePassword
              ? `Xin chào ${user.fullName}. Đây là lần đăng nhập đầu tiên, vui lòng đặt mật khẩu mới để tiếp tục.`
              : `Tài khoản ${user.employeeCode}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
          {!user.mustChangePassword && (
            <Link
              href="/dashboard"
              className="mt-4 block text-center text-sm text-muted-foreground hover:underline"
            >
              ← Quay lại
            </Link>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
