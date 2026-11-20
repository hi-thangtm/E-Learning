import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader title="Phòng ban" description="Đang tải cây phòng ban..." />
      <DataTableSkeleton columns={6} withFilters={false} />
    </>
  );
}
