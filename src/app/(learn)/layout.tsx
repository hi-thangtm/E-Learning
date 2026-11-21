import { requireUser } from "@/lib/current-user";

/**
 * Khung trang học: TOÀN MÀN HÌNH, không sidebar / header chính (feature-spec 2.4).
 * Thư mục "(learn)" không xuất hiện trên đường dẫn: src/app/(learn)/learn/... → /learn/...
 */
export default async function LearnLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-dvh min-w-[1200px] bg-background">{children}</div>;
}
