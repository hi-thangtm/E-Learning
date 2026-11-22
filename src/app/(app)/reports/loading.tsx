import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <PageHeader title="Báo cáo" description="Đang tính số liệu..." />
      <Skeleton className="h-36 rounded-md" />
      <Skeleton className="h-12 rounded-md" />
      <DataTableSkeleton columns={8} />
    </div>
  );
}
