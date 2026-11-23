import { FormSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Sửa quy tắc giao tự động" />
      <FormSkeleton fields={6} />
    </div>
  );
}
