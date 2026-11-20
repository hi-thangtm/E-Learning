import type { ReactNode } from "react";
import Link from "next/link";
import { Inbox, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** Trạng thái rỗng (docs/design-system.md mục 5.6). */
export function DataTableEmpty({
  title,
  description,
  action,
  filtered,
  clearHref,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  /** Đang có tìm kiếm / bộ lọc -> hiện "Không tìm thấy kết quả phù hợp" + nút Xoá bộ lọc */
  filtered?: boolean;
  clearHref?: string;
}) {
  if (filtered) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
          <SearchX className="size-8" />
        </div>
        <p className="text-lg font-medium text-foreground">Không tìm thấy kết quả phù hợp</p>
        <p className="max-w-sm text-[15px] text-muted-foreground">
          Thử từ khoá khác hoặc bỏ bớt bộ lọc.
        </p>
        {clearHref && (
          <Link href={clearHref} className={buttonVariants({ variant: "secondary" })}>
            Xoá bộ lọc
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
        <Inbox className="size-8" />
      </div>
      <p className="text-lg font-medium text-foreground">{title}</p>
      {description && <p className="max-w-sm text-[15px] text-muted-foreground">{description}</p>}
      {action}
    </div>
  );
}
