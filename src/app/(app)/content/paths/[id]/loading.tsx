import { PanelSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Khớp PathHeader: link “Lộ trình học” + thẻ (icon, tên lộ trình, dòng phụ, nút) + 2 cột nội dung. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-5 w-28" />
        <div className="flex items-center gap-4 rounded-md bg-card p-6 shadow-md">
          <Skeleton className="size-14 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-8 w-2/3 max-w-md" />
            <Skeleton className="h-5 w-1/2 max-w-sm" />
          </div>
          <Skeleton className="h-[38px] w-32" />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PanelSkeleton lines={6} />
        <PanelSkeleton lines={3} />
      </div>
    </div>
  );
}
