import { FormSkeleton, LoadingHeader, PanelSkeleton } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Mẫu chứng nhận" />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <FormSkeleton fields={6} />
        <PanelSkeleton chart />
      </div>
    </div>
  );
}
