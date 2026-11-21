import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-8 w-80" />
        <Skeleton className="h-5 w-[32rem]" />
      </div>
      <div className="space-y-4 rounded-md bg-card p-6 shadow-md">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-[38px] w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </>
  );
}
