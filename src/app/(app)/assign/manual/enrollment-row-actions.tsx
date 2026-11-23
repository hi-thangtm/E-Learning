"use client";

import { useState, useTransition } from "react";
import { CalendarClock, EllipsisVertical, ListPlus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField, FormGrid } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cancelEnrollmentAction, extendEnrollmentAction } from "./actions";
import { GrantAttemptsDialog } from "./grant-attempts-dialog";
import { Tooltip } from "@/components/ui/tooltip";

const ITEM = "mx-1 gap-3 rounded-md px-3 py-2 text-[15px]";
const RULE_LOCK = "Đang giao tự động theo quy tắc — tắt quy tắc ở mục Giao tự động";

/** Menu ⋮ mỗi lượt giao: Gia hạn, Cấp thêm lượt làm bài, Huỷ giao. Quyền thật kiểm tra lại ở server. */
export function EnrollmentRowActions({
  enrollment,
}: {
  enrollment: {
    id: string;
    learner: string;
    course: string;
    /** yyyy-MM-dd (giờ VN) hoặc "" */
    dueDate: string;
    canExtend: boolean;
    canCancel: boolean;
    /** Lượt chưa bị huỷ → cấp thêm lượt làm bài kiểm tra được */
    canGrantAttempts: boolean;
    lockedByRule: boolean;
  };
}) {
  const [extendOpen, setExtendOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [grantOpen, setGrantOpen] = useState(false);
  if (!enrollment.canExtend && !enrollment.canCancel && !enrollment.canGrantAttempts && !enrollment.lockedByRule) return null;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Tooltip label={`Thao tác cho lượt giao của ${enrollment.learner}`}><Button variant="ghost" size="icon-sm" aria-label={`Thao tác cho lượt giao của ${enrollment.learner}`}>
              <EllipsisVertical className="size-[18px]" />
            </Button></Tooltip>
          }
        />
        <DropdownMenuContent align="end" className="w-56 rounded-md py-2 shadow-lg ring-0">
          {enrollment.canExtend && (
            <DropdownMenuItem className={ITEM} onClick={() => setExtendOpen(true)}>
              <CalendarClock className="size-[18px]" />
              Gia hạn
            </DropdownMenuItem>
          )}
          {enrollment.canGrantAttempts && (
            <DropdownMenuItem className={ITEM} onClick={() => setGrantOpen(true)}>
              <ListPlus className="size-[18px]" />
              Cấp thêm lượt làm bài
            </DropdownMenuItem>
          )}
          {enrollment.lockedByRule ? (
            <DropdownMenuItem className={ITEM} disabled title={RULE_LOCK}>
              <XCircle className="size-[18px]" />
              <span>
                Huỷ giao
                <span className="block text-[12px] text-muted-foreground">Đang giao tự động theo quy tắc</span>
              </span>
            </DropdownMenuItem>
          ) : (
            enrollment.canCancel && (
              <DropdownMenuItem variant="destructive" className={ITEM} onClick={() => setCancelOpen(true)}>
                <XCircle className="size-[18px]" />
                Huỷ giao
              </DropdownMenuItem>
            )
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {extendOpen && <ExtendDialog enrollment={enrollment} onClose={() => setExtendOpen(false)} />}
      {grantOpen && <GrantAttemptsDialog enrollment={enrollment} onClose={() => setGrantOpen(false)} />}
      {cancelOpen && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setCancelOpen(false)}
          title="Huỷ lượt giao khoá?"
          description={`${enrollment.learner} sẽ không còn được giao khoá “${enrollment.course}”. Tiến độ đã học được giữ lại; giao lại sau sẽ kích hoạt lại lượt này.`}
          confirmLabel="Huỷ giao"
          tone="destructive"
          action={() => cancelEnrollmentAction(enrollment.id)}
        />
      )}
    </div>
  );
}

function ExtendDialog({
  enrollment,
  onClose,
}: {
  enrollment: { id: string; learner: string; course: string; dueDate: string };
  onClose: () => void;
}) {
  const [date, setDate] = useState(enrollment.dueDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const r = await extendEnrollmentAction(enrollment.id, date);
        if (r.ok) {
          toast.success(r.message ?? "Đã gia hạn.");
          onClose();
        } else {
          setError(r.errors?.dueDate ?? null);
          if (r.message) toast.error(r.message);
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Gia hạn</DialogTitle>
          <DialogDescription>
            {enrollment.learner} — {enrollment.course}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody>
            <FormGrid>
            <FormField label="Hạn mới" htmlFor="extend-date" required error={error ?? undefined} hint="Hết ngày này (giờ Việt Nam) mới tính quá hạn.">
              <Input id="extend-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-invalid={!!error} />
            </FormField>
            </FormGrid>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={pending || !date}>
              {pending ? "Đang lưu..." : "Gia hạn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
