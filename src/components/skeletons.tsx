import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Khung xám dùng chung cho loading.tsx (đúng bố cục trang để không “nhảy” khi dữ liệu tới).
 * Bảng danh sách: dùng `DataTableSkeleton` (components/data-table/data-table-skeleton.tsx).
 */

/** Tiêu đề trang + dòng mô tả “Đang tải…” */
export function LoadingHeader({ title, description = "Đang tải..." }: { title: string; description?: string }) {
  return <PageHeader title={title} description={description} />;
}

/** Hàng thẻ số liệu (mục 5.1) */
export function StatCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className={cn("grid gap-4 sm:gap-6", count === 5 ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4")}>
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-[118px] rounded-md" />
      ))}
    </div>
  );
}

/** Thẻ trắng có tiêu đề + nội dung xám (biểu đồ, danh sách, panel) */
export function PanelSkeleton({ className, lines = 4, chart = false }: { className?: string; lines?: number; chart?: boolean }) {
  return (
    <section className={cn("space-y-4 rounded-md bg-card p-6 shadow-md", className)}>
      <Skeleton className="h-6 w-48" />
      {chart ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        Array.from({ length: lines }, (_, i) => <Skeleton key={i} className={cn("h-5", i % 3 === 2 ? "w-2/3" : "w-full")} />)
      )}
    </section>
  );
}

/** Lưới thẻ khoá học / lộ trình / chứng nhận (co giãn theo màn hình) */
export function CardGridSkeleton({ count = 6, media = true }: { count?: number; media?: boolean }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-md bg-card p-2 shadow-md">
          {media && <Skeleton className="aspect-video w-full" />}
          <div className="space-y-3 p-3">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-9 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Form / wizard: các ô nhập 2 cột + nút */
export function FormSkeleton({ fields = 6, steps = 0 }: { fields?: number; steps?: number }) {
  return (
    <section className="space-y-6 rounded-md bg-card p-6 shadow-md">
      {steps > 0 && (
        <div className="flex gap-4">
          {Array.from({ length: steps }, (_, i) => (
            <Skeleton key={i} className="h-10 flex-1" />
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-[38px] w-full" />
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-4">
        <Skeleton className="h-[38px] w-24" />
        <Skeleton className="h-[38px] w-32" />
      </div>
    </section>
  );
}

/** Đầu trang chi tiết: ảnh / avatar + tên + vài dòng thông tin */
export function DetailHeaderSkeleton({ media = false }: { media?: boolean }) {
  return (
    <section className="flex flex-col gap-6 rounded-md bg-card p-6 shadow-md sm:flex-row">
      {media ? <Skeleton className="aspect-video w-full sm:w-72" /> : <Skeleton className="size-20 shrink-0 rounded-full" />}
      <div className="flex-1 space-y-3">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-5 w-1/3" />
        <Skeleton className="h-[38px] w-40" />
      </div>
    </section>
  );
}
