import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader title="Nhật ký thao tác" description="Đang tải nhật ký..." />
      <DataTableSkeleton columns={5} />
    </>
  );
}
