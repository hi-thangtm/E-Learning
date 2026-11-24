import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Tổng quan tập đoàn" description="Đang tính số liệu..." />
      <div className="grid grid-cols-4 gap-6">
        {Array.from({ length: 7 }, (_, i) => (
          <Skeleton key={i} className="h-[118px] rounded-md" />
        ))}
      </div>
      <Skeleton className="h-64 rounded-md" />
      <div className="grid grid-cols-2 gap-6">
        <Skeleton className="h-96 rounded-md" />
        <Skeleton className="h-96 rounded-md" />
      </div>
    </div>
  );
}
