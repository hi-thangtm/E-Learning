import { PanelSkeleton, StatCardsSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Khung tải Tổng quan — khớp trang thật: lời chào (tên động → Skeleton), 5 thẻ số liệu, 2 khối (ui-review #73). */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64 max-w-full" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <StatCardsSkeleton count={5} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <PanelSkeleton className="lg:col-span-7" lines={6} />
        <PanelSkeleton className="lg:col-span-5" lines={6} />
      </div>
    </div>
  );
}
