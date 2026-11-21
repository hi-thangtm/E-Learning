import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Khoá học của tôi" description="Đang tải khoá học..." />
      <section className="rounded-md bg-card shadow-md">
        <div className="flex gap-4 border-b border-border px-6 py-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
        <div className="flex justify-end gap-4 px-6 py-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid grid-cols-3 gap-6 px-6 pb-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-md border border-border p-2">
              <Skeleton className="aspect-video w-full" />
              <div className="space-y-3 p-3">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-2 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
