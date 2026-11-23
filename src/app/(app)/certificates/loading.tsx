import { CardGridSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Chứng nhận" description="Đang tải chứng nhận..." />
      <CardGridSkeleton count={6} media={false} />
    </div>
  );
}
