import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <PageHeader title="Thư viện khoá học" description="Đang tải..." />
      <section className="rounded-md bg-card p-6 shadow-md">
        <Skeleton className="mb-6 h-[38px] w-80" />
        <div className="grid grid-cols-3 gap-6">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="space-y-3 rounded-md border border-border p-2">
              <Skeleton className="aspect-video w-full" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
