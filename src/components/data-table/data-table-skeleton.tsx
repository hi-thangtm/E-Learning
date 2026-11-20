import { Skeleton } from "@/components/ui/skeleton";

/** Khung "đang tải" cho bảng — dùng trong loading.tsx. */
export function DataTableSkeleton({
  columns = 5,
  rows = 8,
  withFilters = true,
}: {
  columns?: number;
  rows?: number;
  withFilters?: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-md bg-card shadow-md" aria-busy="true" aria-label="Đang tải">
      {withFilters && (
        <div className="space-y-4 p-6">
          <Skeleton className="h-6 w-24" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-[38px]" />
          </div>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-border p-6">
        <Skeleton className="h-[38px] w-20" />
        <Skeleton className="h-[38px] w-64" />
      </div>
      <div className="border-t border-border">
        <div className="flex h-14 items-center gap-8 border-b border-border px-6">
          {Array.from({ length: columns }, (_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex h-[50px] items-center gap-8 border-b border-border px-6 last:border-0">
            {Array.from({ length: columns }, (_, i) => (
              <Skeleton key={i} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border px-6 py-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-[38px] w-40" />
      </div>
    </div>
  );
}
