import { Users } from "lucide-react";

/** MANAGER chưa làm trưởng phòng nào -> phạm vi đội rỗng. */
export function EmptyTeam() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-md bg-card px-6 py-16 text-center shadow-md">
      <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
        <Users className="size-8" />
      </div>
      <p className="text-lg font-medium text-foreground">Bạn chưa được chỉ định làm trưởng phòng nào</p>
      <p className="max-w-md text-[15px] text-muted-foreground">
        Khi Admin công ty đặt bạn làm trưởng một phòng ban, nhân viên của phòng đó (và các phòng con) sẽ hiện ở đây.
      </p>
    </section>
  );
}
