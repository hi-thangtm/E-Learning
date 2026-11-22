import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Ngân hàng câu hỏi" description="Đang tải..." />
      <div className="mb-6 rounded-md bg-card p-6 shadow-md">
        <Skeleton className="h-[38px] w-full max-w-xl" />
      </div>
      <DataTableSkeleton columns={7} />
    </>
  );
}
