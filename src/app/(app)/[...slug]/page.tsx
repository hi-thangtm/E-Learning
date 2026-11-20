import { redirect } from "next/navigation";
import { Construction } from "lucide-react";
import { requireUser } from "@/lib/current-user";
import { canAccess, findMenuItem } from "@/lib/roles";

/**
 * Trang tạm cho các mục menu CHƯA làm. Khi làm thật một mục (vd. /org/users),
 * tạo file src/app/(app)/org/users/page.tsx — Next.js sẽ ưu tiên file đó.
 * Vẫn kiểm tra quyền: gõ tay đường dẫn không thuộc vai trò mình -> về Tổng quan.
 */
export default async function ComingSoonPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const pathname = "/" + slug.join("/");
  const user = await requireUser();

  if (!canAccess(pathname, user.role)) redirect("/dashboard");

  const item = findMenuItem(pathname);

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-center">
      <Construction className="size-10 text-muted-foreground" />
      <h1 className="text-xl font-semibold">{item?.label ?? "Trang"} đang được xây dựng</h1>
      <p className="text-sm text-muted-foreground">Chức năng này sẽ có ở các bước tiếp theo.</p>
    </div>
  );
}
