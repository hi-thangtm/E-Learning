import { LoadingHeader, PanelSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Tác vụ hằng ngày" />
      <PanelSkeleton lines={3} />
      <PanelSkeleton lines={8} />
    </div>
  );
}
