import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-64" />
      </div>
      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-4 space-y-4 rounded-md bg-card p-6 shadow-md">
          <Skeleton className="mx-auto mt-6 size-[100px] rounded-md" />
          <Skeleton className="mx-auto h-6 w-40" />
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <div className="col-span-8 space-y-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="space-y-4 rounded-md bg-card p-6 shadow-md">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
