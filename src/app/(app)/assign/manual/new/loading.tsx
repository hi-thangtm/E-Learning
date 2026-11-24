import { FormSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Giao khoá học / lộ trình" />
      <FormSkeleton steps={4} fields={4} />
    </div>
  );
}
