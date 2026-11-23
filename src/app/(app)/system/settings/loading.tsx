import { FormSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Cài đặt hệ thống" />
      <FormSkeleton fields={4} />
      <FormSkeleton fields={4} />
    </div>
  );
}
