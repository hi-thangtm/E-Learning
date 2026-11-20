import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader title="Chức danh" description="Đang tải danh sách..." />
      <DataTableSkeleton columns={6} />
    </>
  );
}
