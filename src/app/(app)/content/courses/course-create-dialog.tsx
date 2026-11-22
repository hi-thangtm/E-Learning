"use client";

import { useActionState, useEffect, useState, type ReactElement } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initialActionState } from "@/lib/action-state";
import { createCourseAction } from "./actions";

const NONE = "__none__";

/** Dialog “Tạo khoá học”: mã, tên, danh mục. Tạo xong server chuyển sang trang soạn. */
export function CourseCreateDialog({
  trigger,
  categories,
  companyName,
}: {
  trigger: ReactElement;
  /** Chỉ danh mục đang dùng */
  categories: { id: string; name: string }[];
  companyName: string;
}) {
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
          <DialogTitle>Tạo khoá học</DialogTitle>
          <DialogDescription>
            Khoá học mới ở trạng thái Nháp, thuộc {companyName}. Các thông tin khác điền ở trang soạn.
          </DialogDescription>
        </DialogHeader>
        <CreateForm key={formKey} categories={categories} />
      </DialogContent>
    </Dialog>
  );
}

function CreateForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createCourseAction, initialActionState);
  const [categoryId, setCategoryId] = useState(state.values?.categoryId || NONE);

  // Thành công -> server redirect; ở đây chỉ báo lỗi chung
  useEffect(() => {
    if (!state.ok && state.message) toast.error(state.message);
  }, [state]);

  const items = [{ value: NONE, label: "— Chưa chọn —" }, ...categories.map((c) => ({ value: c.id, label: c.name }))];
  const err = state.errors ?? {};

  return (
    <form action={formAction} className="contents" noValidate>
      <input type="hidden" name="categoryId" value={categoryId === NONE ? "" : categoryId} />

      <DialogBody>
        <FormGrid>
        <FormField label="Mã khoá học" htmlFor="code" required error={err.code} hint="Chữ in hoa không dấu, không trùng. VD: QT-BH-01">
          <Input
            id="code"
            name="code"
            defaultValue={state.values?.code}
            placeholder="VD: QT-BH-01"
            maxLength={30}
            autoComplete="off"
            autoFocus
            className="uppercase placeholder:normal-case"
            aria-invalid={!!err.code}
          />
        </FormField>

        <FormField label="Tên khoá học" htmlFor="title" required error={err.title}>
          <Input
            id="title"
            name="title"
            defaultValue={state.values?.title}
            placeholder="VD: Quy trình bán hàng cơ bản"
            maxLength={200}
            autoComplete="off"
            aria-invalid={!!err.title}
          />
        </FormField>

        <FormField label="Danh mục" htmlFor="category-select" error={err.categoryId}>
          <Select items={items} value={categoryId} onValueChange={(v) => setCategoryId(v ? String(v) : NONE)}>
            <SelectTrigger id="category-select" className="w-full" aria-invalid={!!err.categoryId}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        </FormGrid>
      </DialogBody>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang tạo..." : "Tạo và soạn"}
        </Button>
      </DialogFooter>
    </form>
  );
}
