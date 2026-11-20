import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { AppLogo } from "@/components/app-logo";
import { getCurrentUser } from "@/lib/current-user";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

/** Trang đăng nhập theo mẫu login-v2 của Vuexy: minh hoạ bên trái, form 480px bên phải. */
export default async function LoginPage() {
  // Đã đăng nhập rồi thì không cần vào trang này
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");

  return (
    <main className="flex min-h-dvh">
      {/* Bên trái: ảnh minh hoạ trên nền xám nhạt, mảng sóng ở đáy */}
      <div className="relative hidden flex-1 items-center justify-center overflow-hidden bg-background p-6 md:flex">
        <Image
          src="/images/illustrations/auth/v2-login-light.png"
          alt=""
          width={1275}
          height={1424}
          priority
          className="relative z-10 m-12 h-auto max-h-[450px] w-auto max-w-full lg:max-h-[550px] 2xl:max-h-[680px]"
        />
        <Image
          src="/images/pages/auth-mask-light.png"
          alt=""
          width={1920}
          height={698}
          className="absolute inset-x-0 bottom-0 h-auto max-h-[355px] w-full"
        />
      </div>

      {/* Bên phải: form */}
      <div className="relative flex w-full items-center justify-center bg-card p-6 md:w-[480px] md:p-12">
        <div className="absolute top-[33px] left-[38px]">
          <AppLogo />
        </div>

        <div className="flex w-full flex-col gap-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-medium text-foreground">Chào mừng đến với E-Learning! 👋🏻</h1>
            <p className="text-[15px] text-muted-foreground">
              Đăng nhập bằng mã nhân viên để bắt đầu học tập.
            </p>
          </div>

          <LoginForm />

          <p className="text-center text-[15px] text-muted-foreground">
            Quên mật khẩu? Liên hệ quản trị đào tạo của công ty để được đặt lại.
          </p>
        </div>
      </div>
    </main>
  );
}
