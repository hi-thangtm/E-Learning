import { LoadingHeader, PanelSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Đang tải">
      <LoadingHeader title="Hướng dẫn sử dụng" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="hidden space-y-2 rounded-md bg-card p-4 shadow-md lg:block">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
        <div className="min-w-0 space-y-6">
          <div className="rounded-md bg-card p-4 shadow-md sm:p-6">
            <Skeleton className="h-11 w-full" />
          </div>
          <PanelSkeleton lines={2} />
          <PanelSkeleton lines={5} chart />
        </div>
      </div>
    </div>
  );
}
