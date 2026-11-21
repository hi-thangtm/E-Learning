import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-6 space-y-3">
        <Skeleton className="h-5 w-24" />
        <div className="flex items-center gap-4 rounded-md bg-card p-6 shadow-md">
          <Skeleton className="aspect-video w-28 rounded-sm" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-80" />
            <Skeleton className="h-5 w-56" />
          </div>
        </div>
      </div>
      <div className="rounded-md bg-card shadow-md">
        <div className="flex gap-6 border-b border-border px-6 py-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-6 w-24" />
          ))}
        </div>
        <div className="grid grid-cols-3 gap-6 p-6">
          <div className="col-span-2 space-y-4">
            <Skeleton className="h-[38px] w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-[38px] w-full" />
          </div>
          <Skeleton className="aspect-video w-full" />
        </div>
      </div>
    </>
  );
}
