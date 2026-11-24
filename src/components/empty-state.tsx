import type { ComponentType, ReactNode } from "react";
import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Trạng thái rỗng dùng chung (docs/design-system.md mục 5.6): icon tròn, tiêu đề, câu giải thích, bước tiếp theo.
 * `action` (nút / link) CHỈ truyền khi người xem có quyền làm bước đó (VD "Tạo khoá học" chỉ cho Biên soạn / Admin).
 *
 *   <EmptyState icon={BookOpen} title="Chưa có khoá học nào" description="..." action={<Button>Tạo khoá học</Button>} />
 */
export function EmptyState({
  icon: Icon = Inbox,
  iconNode,
  title,
  description,
  action,
  size = "default",
  className,
}: {
  icon?: ComponentType<{ className?: string }>;
  /** Icon đã dựng sẵn (thay cho `icon`) — VD truyền từ props của component cha */
  iconNode?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** sm: trong thẻ / panel nhỏ (padding và icon nhỏ hơn) */
  size?: "default" | "sm";
  className?: string;
}) {
  const sm = size === "sm";
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 text-center", sm ? "px-4 py-8" : "px-4 py-16", className)}>
      <div className={cn("flex items-center justify-center rounded-full bg-primary/16 text-primary", sm ? "size-12" : "size-16")}>
        {iconNode ?? <Icon className={sm ? "size-6" : "size-8"} />}
      </div>
      <p className={cn("font-medium text-foreground", sm ? "text-[15px]" : "text-lg")}>{title}</p>
      {description && <p className="max-w-md text-[15px] text-muted-foreground">{description}</p>}
      {action && <div className="mt-1 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </div>
  );
}

/** Có tìm kiếm / bộ lọc mà không ra kết quả: "Không tìm thấy kết quả phù hợp" + "Xoá bộ lọc". */
export function EmptyFiltered({ clearHref, size, className }: { clearHref?: string; size?: "default" | "sm"; className?: string }) {
  return (
    <EmptyState
      icon={SearchX}
      title="Không tìm thấy kết quả phù hợp"
      description="Thử từ khoá khác hoặc bỏ bớt bộ lọc."
      size={size}
      className={className}
      action={
        clearHref && (
          <Link href={clearHref} className={buttonVariants({ variant: "outline" })}>
            Xoá bộ lọc
          </Link>
        )
      }
    />
  );
}
