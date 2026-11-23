import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-40" />
      <div className="grid grid-cols-1 gap-6 rounded-md bg-card p-4 shadow-md sm:p-6 lg:grid-cols-12">
        <Skeleton className="aspect-video lg:col-span-4" />
        <div className="space-y-3 lg:col-span-5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-16 w-full" />
        </div>
        <Skeleton className="h-48 lg:col-span-3" />
      </div>
      <div className="space-y-3 rounded-md bg-card p-6 shadow-md">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  );
}
