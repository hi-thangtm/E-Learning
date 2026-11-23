import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { DetailHeaderSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Chi tiết nhân viên" />
      <DetailHeaderSkeleton />
      <DataTableSkeleton columns={6} rows={6} withFilters={false} />
    </div>
  );
}
