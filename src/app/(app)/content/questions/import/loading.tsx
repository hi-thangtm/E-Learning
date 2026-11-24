import { FormSkeleton } from "@/components/skeletons";
import { Skeleton } from "@/components/ui/skeleton";

/** Khớp trang thật: link “Ngân hàng câu hỏi” + tiêu đề + mô tả 2 dòng. */
export default function Loading() {
  return (
    <>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-5 w-40" />
        <h1 className="text-2xl font-medium text-foreground">Import câu hỏi từ Excel</h1>
        <Skeleton className="h-5 w-full max-w-2xl" />
      </div>
      <FormSkeleton fields={2} />
    </>
  );
}
