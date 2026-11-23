import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Thông báo" description="Đang tải..." />
      <div className="overflow-hidden rounded-md bg-card shadow-md" aria-busy="true" aria-label="Đang tải">
        <div className="flex items-center justify-between p-6">
          <Skeleton className="h-[38px] w-full sm:w-56" />
          <Skeleton className="h-[38px] w-full sm:w-64" />
        </div>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 border-t border-border px-6 py-4">
            <Skeleton className="size-[38px] rounded-full" />
            <div className="grid flex-1 gap-1.5">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
