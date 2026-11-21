import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex h-dvh flex-col">
      <div className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-6">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-6 flex-1" />
        <Skeleton className="h-2 w-56" />
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex-1 p-6">
          <div className="mx-auto max-w-[1100px] space-y-6">
            <Skeleton className="aspect-video w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <div className="w-[360px] space-y-3 border-l border-border bg-card p-5">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
