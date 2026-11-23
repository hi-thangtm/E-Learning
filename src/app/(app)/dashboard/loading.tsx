import { LoadingHeader, PanelSkeleton, StatCardsSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Tổng quan" description="Đang tải số liệu..." />
      <StatCardsSkeleton />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <PanelSkeleton className="lg:col-span-7" lines={6} />
        <PanelSkeleton className="lg:col-span-5" lines={6} />
      </div>
    </div>
  );
}
