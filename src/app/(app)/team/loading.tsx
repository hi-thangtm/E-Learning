import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan đội" description="Đang tải số liệu..." />
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-md" />
        ))}
      </div>
      <div className="grid grid-cols-12 gap-6">
        <Skeleton className="col-span-7 h-96 rounded-md" />
        <Skeleton className="col-span-5 h-96 rounded-md" />
      </div>
    </div>
  );
}
