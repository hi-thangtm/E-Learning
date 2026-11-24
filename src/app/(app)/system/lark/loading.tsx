import { LoadingHeader, PanelSkeleton } from "@/components/skeletons";

/** Khớp trang thật: trạng thái, ghép công ty, đồng bộ, lịch sử. */
export default function Loading() {
  return (
    <div className="space-y-6">
      <LoadingHeader title="Kết nối Lark" />
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={6} />
      <PanelSkeleton lines={2} />
      <PanelSkeleton lines={5} />
    </div>
  );
}
