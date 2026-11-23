import { DetailHeaderSkeleton, LoadingHeader, PanelSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Giới thiệu khoá học" />
      <DetailHeaderSkeleton media />
      <PanelSkeleton lines={6} />
    </div>
  );
}
