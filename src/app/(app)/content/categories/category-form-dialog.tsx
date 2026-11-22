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
import { createCategoryAction, updateCategoryAction } from "./actions";

export type CategoryFormValue = { id: string; name: string; sortOrder: number };

/** Dialog thêm / sửa danh mục khoá học. Không truyền `category` = thêm mới. */
export function CategoryFormDialog({
  trigger,
  category,
}: {
  trigger: ReactElement;
  category?: CategoryFormValue;
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
          <DialogTitle>{category ? "Sửa danh mục" : "Thêm danh mục"}</DialogTitle>
          <DialogDescription>Danh mục khoá học dùng chung cho toàn tập đoàn.</DialogDescription>
        </DialogHeader>
        <CategoryForm key={formKey} category={category} onSuccess={close} />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ category, onSuccess }: { category?: CategoryFormValue; onSuccess: () => void }) {
  const [state, formAction, pending] = useActionState(
    category ? updateCategoryAction : createCategoryAction,
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
      {category && <input type="hidden" name="id" value={category.id} />}

      <DialogBody>
        <FormGrid>
        <FormField label="Tên danh mục" htmlFor="name" required error={state.errors?.name} hint="Không trùng với danh mục khác.">
          <Input
            id="name"
            name="name"
            defaultValue={state.values?.name ?? category?.name}
            placeholder="VD: Quy trình"
            maxLength={100}
            autoComplete="off"
            autoFocus
            aria-invalid={!!state.errors?.name}
            aria-describedby={state.errors?.name ? "name-error" : undefined}
          />
        </FormField>

        <FormField
          label="Thứ tự hiển thị"
          htmlFor="sortOrder"
          error={state.errors?.sortOrder}
          hint={
            category
              ? "Số nhỏ đứng trước. Có thể đổi nhanh bằng nút mũi tên trong bảng."
              : "Số nhỏ đứng trước. Để trống = xếp cuối danh sách."
          }
        >
          <Input
            id="sortOrder"
            name="sortOrder"
            type="number"
            inputMode="numeric"
            min={0}
            max={9999}
            step={1}
            defaultValue={state.values?.sortOrder ?? (category ? String(category.sortOrder) : "")}
            placeholder="Tự động"
            className="w-40"
            aria-invalid={!!state.errors?.sortOrder}
            aria-describedby={state.errors?.sortOrder ? "sortOrder-error" : undefined}
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
