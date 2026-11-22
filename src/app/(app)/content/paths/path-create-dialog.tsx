"use client";

import { useActionState, useState, type ReactElement } from "react";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { createPathAction } from "./actions";

/** Dialog “Tạo lộ trình”: mã + tên. Tạo xong server chuyển sang trang soạn lộ trình. */
export function PathCreateDialog({ trigger, companyName }: { trigger: ReactElement; companyName: string }) {
  const [open, setOpen] = useState(false);
  const [formKey, setFormKey] = useState(0);

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
          <DialogTitle>Tạo lộ trình học</DialogTitle>
          <DialogDescription>Lộ trình thuộc {companyName}. Sau khi tạo, thêm và sắp xếp các khoá học.</DialogDescription>
        </DialogHeader>
        <CreateForm key={formKey} />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm() {
  const [state, formAction, pending] = useActionState(createPathAction, initialActionState);
  const err = state.errors ?? {};
  return (
    <form action={formAction} noValidate className="contents">
      <DialogBody>
        <FormGrid>
          <FormField label="Mã lộ trình" htmlFor="path-code" required error={err.code} hint="Chữ in hoa không dấu, không trùng. VD: LT-HN-KD">
            <Input
              id="path-code"
              name="code"
              defaultValue={state.values?.code}
              maxLength={30}
              autoComplete="off"
              autoFocus
              className="uppercase placeholder:normal-case"
              placeholder="VD: LT-HN-KD"
              aria-invalid={!!err.code}
            />
          </FormField>
          <FormField label="Tên lộ trình" htmlFor="path-title" required error={err.title}>
            <Input
              id="path-title"
              name="title"
              defaultValue={state.values?.title}
              maxLength={200}
              autoComplete="off"
              placeholder="VD: Hội nhập 30 ngày — Kinh doanh"
              aria-invalid={!!err.title}
            />
          </FormField>
        </FormGrid>
        {state.message && !state.ok && <p className="mt-3 text-[13px] text-destructive">{state.message}</p>}
      </DialogBody>
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang tạo..." : "Tạo lộ trình"}
        </Button>
      </DialogFooter>
    </form>
  );
}
