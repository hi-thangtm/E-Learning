import { DataTableSkeleton } from "@/components/data-table/data-table-skeleton";
import { PageHeader } from "@/components/page-header";

export default function Loading() {
  return (
    <>
      <PageHeader title="Danh mục khoá học" description="Đang tải danh sách..." />
      <DataTableSkeleton columns={5} />
    </>
  );
}
