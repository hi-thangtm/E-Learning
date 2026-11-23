import { Users } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

/** MANAGER chưa làm trưởng phòng nào -> phạm vi đội rỗng. */
export function EmptyTeam() {
  return (
    <EmptyState
      icon={Users}
      title="Bạn chưa được chỉ định làm trưởng phòng nào"
      description="Khi Admin công ty đặt bạn làm trưởng một phòng ban, nhân viên của phòng đó (và các phòng con) sẽ hiện ở đây."
      className="rounded-md bg-card shadow-md"
    />
  );
}
