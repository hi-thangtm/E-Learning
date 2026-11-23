import type { ReactNode } from "react";

/**
 * Tiêu đề trang (h4) + mô tả + vùng nút hành động bên phải.
 * Theo docs/design-system.md mục 4.3.
 */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0 space-y-1">
        <h1 className="text-xl font-medium break-words text-foreground sm:text-2xl">{title}</h1>
        {description && <p className="text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3 sm:gap-4">{actions}</div>}
    </div>
  );
}
