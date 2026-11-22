"use client";

import { useActionState, useCallback, useEffect, useState, type ReactElement } from "react";
import { toast } from "sonner";
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
import { createCompanyAction, updateCompanyAction } from "./actions";

export type CompanyFormValue = { id: string; code: string; name: string; isGroup: boolean };

/** Dialog thêm / sửa công ty. Không truyền `company` = thêm công ty con mới. */
export function CompanyFormDialog({
  trigger,
  company,
}: {
  trigger: ReactElement;
  company?: CompanyFormValue;
}) {
  const [open, setOpen] = useState(false);
  // Mỗi lần mở dialog tạo form mới -> xoá lỗi / dữ liệu cũ
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  const title = !company ? "Thêm công ty con" : company.isGroup ? "Sửa công ty tổng" : "Sửa công ty con";

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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {company?.isGroup
              ? "Công ty tổng chỉ được sửa tên."
              : "Công ty con luôn trực thuộc công ty tổng."}
          </DialogDescription>
        </DialogHeader>
        <CompanyForm key={formKey} company={company} onSuccess={close} />
      </DialogContent>
    </Dialog>
  );
}

function CompanyForm({ company, onSuccess }: { company?: CompanyFormValue; onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(
    company ? updateCompanyAction : createCompanyAction,
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

  const codeLocked = company?.isGroup ?? false;

  return (
    <form action={formAction} className="contents" noValidate>
      {company && <input type="hidden" name="id" value={company.id} />}

      <DialogBody>
        <FormGrid>
        <FormField
          label="Mã công ty"
          htmlFor="code"
          required={!codeLocked}
          error={state.errors?.code}
          hint={
            codeLocked
              ? "Không sửa được mã công ty tổng."
              : "Chữ in hoa không dấu, không khoảng trắng. VD: CTYB"
          }
        >
          <Input
            id="code"
            name="code"
            defaultValue={state.values?.code ?? company?.code}
            placeholder="VD: CTYB"
            maxLength={20}
            autoComplete="off"
            autoFocus={!codeLocked}
            readOnly={codeLocked}
            className="uppercase placeholder:normal-case read-only:bg-muted read-only:text-muted-foreground"
            aria-invalid={!!state.errors?.code}
            aria-describedby={state.errors?.code ? "code-error" : undefined}
          />
        </FormField>

        <FormField label="Tên công ty" htmlFor="name" required error={state.errors?.name}>
          <Input
            id="name"
            name="name"
            defaultValue={state.values?.name ?? company?.name}
            placeholder="VD: Công ty Thành viên B"
            maxLength={150}
            autoComplete="off"
            autoFocus={codeLocked}
            aria-invalid={!!state.errors?.name}
            aria-describedby={state.errors?.name ? "name-error" : undefined}
          />
        </FormField>
        </FormGrid>
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
