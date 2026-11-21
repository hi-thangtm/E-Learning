"use client";

import { useActionState, useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { createPositionAction, updatePositionAction } from "./actions";

export type PositionFormValue = { id: string; code: string; name: string };

/** Dialog thêm / sửa chức danh. Không truyền `position` = thêm mới. */
export function PositionFormDialog({
  trigger,
  position,
}: {
  trigger: ReactElement;
  position?: PositionFormValue;
}) {
  const [open, setOpen] = useState(false);
  // Mỗi lần mở dialog tạo form mới -> xoá lỗi / dữ liệu cũ
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{position ? "Sửa chức danh" : "Thêm chức danh"}</DialogTitle>
          <DialogDescription>Chức danh dùng chung cho toàn tập đoàn.</DialogDescription>
        </DialogHeader>
        <PositionForm key={formKey} position={position} onSuccess={close} />
      </DialogContent>
    </Dialog>
  );
}

function PositionForm({ position, onSuccess }: { position?: PositionFormValue; onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(
    position ? updatePositionAction : createPositionAction,
    initialActionState,
  );

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="contents" noValidate>
      {position && <input type="hidden" name="id" value={position.id} />}

      <DialogBody className="grid gap-4">
        <FormField
          label="Mã chức danh"
          htmlFor="code"
          required
          error={state.errors?.code}
          hint="Chữ in hoa không dấu, không khoảng trắng. VD: NVKD"
        >
          <Input
            id="code"
            name="code"
            defaultValue={state.values?.code ?? position?.code}
            placeholder="VD: NVKD"
            maxLength={20}
            autoComplete="off"
            autoFocus
            className="uppercase placeholder:normal-case"
            aria-invalid={!!state.errors?.code}
            aria-describedby={state.errors?.code ? "code-error" : undefined}
          />
        </FormField>

        <FormField label="Tên chức danh" htmlFor="name" required error={state.errors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={state.values?.name ?? position?.name}
            placeholder="VD: Nhân viên kinh doanh"
            maxLength={100}
            autoComplete="off"
            aria-invalid={!!state.errors?.name}
            aria-describedby={state.errors?.name ? "name-error" : undefined}
          />
        </FormField>
      </DialogBody>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : "Lưu"}
        </Button>
      </DialogFooter>
    </form>
  );
}
