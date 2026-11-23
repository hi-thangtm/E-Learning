import { LoadingHeader, PanelSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Có gì thay đổi" />
      <PanelSkeleton lines={8} />
    </div>
  );
}
