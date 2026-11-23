import { CardGridSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Lộ trình của tôi" description="Đang tải lộ trình..." />
      <CardGridSkeleton count={3} media={false} />
    </div>
  );
}
