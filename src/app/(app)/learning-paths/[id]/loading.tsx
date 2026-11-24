import { PanelSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Khớp trang thật: link “Lộ trình” + thẻ (tên, mô tả, hạn | vòng tiến độ) + danh sách khoá. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-20" />
      <section className="flex flex-col gap-4 rounded-md bg-card p-4 shadow-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-6">
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-2/3 max-w-md" />
          <Skeleton className="h-5 w-full max-w-xl" />
          <Skeleton className="h-5 w-40" />
        </div>
        <Skeleton className="size-[104px] shrink-0 self-center rounded-full" />
      </section>
      <PanelSkeleton lines={5} />
    </div>
  );
}
