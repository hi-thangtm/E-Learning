import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader title="Tiến độ từng người" description="Đang tải số liệu..." />
      <DataTableSkeleton columns={10} />
    </>
  );
}
