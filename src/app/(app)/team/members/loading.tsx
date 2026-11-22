import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader title="Nhân viên" description="Đang tải số liệu..." />
      <DataTableSkeleton columns={10} />
    </>
  );
}
