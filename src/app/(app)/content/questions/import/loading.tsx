import { FormSkeleton, LoadingHeader } from "@/components/skeletons";

export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Import câu hỏi" />
      <FormSkeleton steps={3} fields={2} />
    </div>
  );
}
