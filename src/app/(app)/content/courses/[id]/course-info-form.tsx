"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ImageIcon, ImagePlus, Trash2, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { fileUrl } from "@/lib/file-url";
import { updateCourseInfoAction } from "./actions";
import { setInfoDirty, useInfoDirty } from "./info-dirty-store";
import { useBeforeUnloadWarning } from "@/components/unsaved-changes-dialog";

const NONE = "__none__";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

export type CourseInfoValue = {
  id: string;
  code: string;
  title: string;
  description: string;
  categoryId: string;
  thumbnailKey: string | null;
  allowSelfEnroll: boolean;
  hasCertificate: boolean;
  certificateValidMonths: string;
};

/** Tab Thông tin của trang soạn khoá học. `readOnly`: khoá của công ty khác (chỉ xem). */
export function CourseInfoForm({
  course,
  categories,
  readOnly,
}: {
  course: CourseInfoValue;
  /** Danh mục đang dùng + danh mục hiện tại của khoá (kể cả đã ẩn) */
  categories: { id: string; name: string; isActive: boolean }[];
  readOnly: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateCourseInfoAction, initialActionState);

  const v = state.values;
  const [categoryId, setCategoryIdState] = useState(course.categoryId || NONE);
  const [allowSelfEnroll, setAllowSelfEnrollState] = useState(course.allowSelfEnroll);
  const [hasCertificate, setHasCertificateState] = useState(course.hasCertificate);
  // Ô chọn / công tắc không phát sự kiện change của form -> tự đánh dấu "chưa lưu"
  const setCategoryId = (v: string) => (setCategoryIdState(v), setInfoDirty(true));
  const setAllowSelfEnroll = (v: boolean) => (setAllowSelfEnrollState(v), setInfoDirty(true));
  const setHasCertificate = (v: boolean) => (setHasCertificateState(v), setInfoDirty(true));

  // --- Ảnh bìa: xem trước file vừa chọn / đánh dấu xoá ảnh hiện tại ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removeThumbnail, setRemoveThumbnail] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  // Báo cho hộp Phát hành biết tab này có thay đổi chưa lưu; rời tab (huỷ form) = không còn gì chưa lưu
  useEffect(() => () => setInfoDirty(false), []);
  // Đóng tab / tải lại trang khi còn thay đổi chưa lưu → trình duyệt hỏi lại (Việc 33 F9)
  useBeforeUnloadWarning(useInfoDirty());

  useEffect(() => {
    if (state.ok) {
      setInfoDirty(false);
      if (state.message) toast.success(state.message);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state]);

  // Sau mỗi lần gửi, React đặt lại ô chọn file -> bỏ xem trước cho khớp (cập nhật ngay khi render, không qua effect)
  const [handledState, setHandledState] = useState(state);
  if (handledState !== state) {
    setHandledState(state);
    setPreview(null);
    setRemoveThumbnail(false);
  }

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  function pickImage(file: File | undefined) {
    setImageError(null);
    if (!file) return setPreview(null);
    // Báo sớm ở trình duyệt; server vẫn kiểm tra lại theo NỘI DUNG file
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Chỉ nhận ảnh JPG, PNG hoặc WEBP.");
    } else if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Ảnh tối đa 2MB.");
    }
    setPreview(URL.createObjectURL(file));
    setRemoveThumbnail(false);
  }

  function clearPicked() {
    if (fileInputRef.current) fileInputRef.current.value = "";
    setPreview(null);
    setImageError(null);
  }

  const shownImage = preview ?? (!removeThumbnail && course.thumbnailKey ? fileUrl(course.thumbnailKey) : null);
  const categoryItems = [
    { value: NONE, label: "— Chưa chọn —" },
    ...categories.map((c) => ({ value: c.id, label: `${c.name}${c.isActive ? "" : " (đã ẩn)"}` })),
  ];
  const err = state.errors ?? {};

  return (
    <form action={formAction} noValidate onChange={() => !readOnly && setInfoDirty(true)}>
      <input type="hidden" name="id" value={course.id} />
      <input type="hidden" name="categoryId" value={categoryId === NONE ? "" : categoryId} />
      <input type="hidden" name="allowSelfEnroll" value={allowSelfEnroll ? "1" : "0"} />
      <input type="hidden" name="hasCertificate" value={hasCertificate ? "1" : "0"} />
      <input type="hidden" name="removeThumbnail" value={removeThumbnail ? "1" : "0"} />

      <fieldset disabled={readOnly || pending} className="grid grid-cols-3 items-start gap-6">
        {/* --- Cột trái: thông tin chính --- */}
        <div className="col-span-2 grid content-start gap-4">
          <FormGrid cols={3}>
            <FormField label="Mã khoá học" htmlFor="code" required error={err.code}>
              <Input
                id="code"
                name="code"
                defaultValue={v?.code ?? course.code}
                maxLength={30}
                autoComplete="off"
                className="uppercase"
                aria-invalid={!!err.code}
              />
            </FormField>
            <FormField label="Tên khoá học" htmlFor="title" required error={err.title} className="col-span-2">
              <Input
                id="title"
                name="title"
                defaultValue={v?.title ?? course.title}
                maxLength={200}
                autoComplete="off"
                aria-invalid={!!err.title}
              />
            </FormField>
          </FormGrid>

          <FormField label="Mô tả" htmlFor="description" error={err.description} hint="Giới thiệu nội dung, đối tượng, mục tiêu khoá học (tối đa 5.000 ký tự).">
            <Textarea
              id="description"
              name="description"
              defaultValue={v?.description ?? course.description}
              rows={7}
              maxLength={5000}
              aria-invalid={!!err.description}
            />
          </FormField>

          <FormField label="Danh mục" htmlFor="category-select" error={err.categoryId}>
            <Select items={categoryItems} value={categoryId} onValueChange={(next) => setCategoryId(next ? String(next) : NONE)}>
              <SelectTrigger id="category-select" className="w-full" aria-invalid={!!err.categoryId}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categoryItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="grid gap-4 rounded-md border border-border p-4">
            <SwitchRow
              id="allowSelfEnroll"
              label="Cho phép tự đăng ký"
              hint="Khoá hiện trong Thư viện để nhân viên tự đăng ký học."
              checked={allowSelfEnroll}
              onChange={setAllowSelfEnroll}
            />
            <SwitchRow
              id="hasCertificate"
              label="Cấp chứng nhận khi hoàn thành"
              hint="Học viên học xong nhận chứng nhận có mã tra cứu."
              checked={hasCertificate}
              onChange={setHasCertificate}
            />
            {hasCertificate && (
              <FormField
                label="Thời hạn chứng nhận (tháng)"
                htmlFor="certificateValidMonths"
                error={err.certificateValidMonths}
                hint="Để trống = vĩnh viễn. VD: 12 = phải học lại hằng năm."
                className="pl-12"
              >
                <Input
                  id="certificateValidMonths"
                  name="certificateValidMonths"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  defaultValue={v?.certificateValidMonths ?? course.certificateValidMonths}
                  placeholder="Vĩnh viễn"
                  className="w-40"
                  aria-invalid={!!err.certificateValidMonths}
                />
              </FormField>
            )}
          </div>
        </div>

        {/* --- Cột phải: ảnh bìa --- */}
        <FormField label="Ảnh bìa" htmlFor="thumbnail" error={err.thumbnail ?? imageError ?? undefined} hint="JPG, PNG hoặc WEBP, tối đa 2MB. Tỉ lệ 16:9 hiển thị đẹp nhất.">
          <div className="grid gap-3">
            <div className="relative aspect-video overflow-hidden rounded-md border border-border bg-muted">
              {shownImage ? (
                <Image src={shownImage} alt="Ảnh bìa khoá học" fill unoptimized sizes="400px" className="object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-foreground/40">
                  <ImageIcon className="size-10" />
                  <span className="text-[13px]">{removeThumbnail ? "Ảnh sẽ bị xoá khi lưu" : "Chưa có ảnh bìa"}</span>
                </div>
              )}
            </div>
            <input
              ref={fileInputRef}
              id="thumbnail"
              name="thumbnail"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => pickImage(e.target.files?.[0])}
            />
            {!readOnly && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                  <ImagePlus />
                  {course.thumbnailKey || preview ? "Đổi ảnh" : "Tải ảnh lên"}
                </Button>
                {preview ? (
                  <Button type="button" variant="ghost" size="sm" onClick={clearPicked}>
                    <Undo2 />
                    Bỏ ảnh vừa chọn
                  </Button>
                ) : course.thumbnailKey && !removeThumbnail ? (
                  <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => (setRemoveThumbnail(true), setInfoDirty(true))}>
                    <Trash2 />
                    Xoá ảnh
                  </Button>
                ) : removeThumbnail ? (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveThumbnail(false)}>
                    <Undo2 />
                    Giữ ảnh cũ
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </FormField>
      </fieldset>

      {readOnly ? (
        <p className="mt-6 rounded-md bg-muted px-4 py-3 text-[13px] text-muted-foreground">
          Khoá học này thuộc công ty khác — bạn chỉ được xem, không sửa được.
        </p>
      ) : (
        <div className="mt-6 flex justify-end gap-4 border-t border-border pt-6">
          <Button type="submit" disabled={pending || !!imageError}>
            {pending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      )}
    </form>
  );
}

function SwitchRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-hint`} className="mt-0.5" />
      <div>
        <label htmlFor={id} className="cursor-pointer text-[15px] text-foreground">
          {label}
        </label>
        <p id={`${id}-hint`} className="text-[13px] text-muted-foreground">
          {hint}
        </p>
      </div>
    </div>
  );
}
