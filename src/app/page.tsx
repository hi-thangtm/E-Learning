import { redirect } from "next/navigation";

// Trang gốc "/" -> chuyển sang Tổng quan (chưa đăng nhập sẽ bị chuyển tiếp về /login)
export default function Home() {
  redirect("/dashboard");
}
