"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, ImagePlus, Save, X } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState } from "@/lib/action-state";
import { fileUrl } from "@/lib/file-url";
import { cn } from "@/lib/utils";
import { updateCertificateTemplateAction } from "./actions";

const MAX_BYTES = 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

export type TemplateValue = {
  logoKey: string | null;
  signerName: string;
  signerTitle: string;
  signatureKey: string | null;
};

/** Form mẫu chứng nhận của 1 công ty. `fallback` = giá trị của công ty tổng (công ty con để trống thì dùng). */
export function TemplateForm({
  companyId,
  value,
  fallback,
}: {
  companyId: string;
  value: TemplateValue;
  /** null = đang sửa công ty tổng */
  fallback: (TemplateValue & { companyName: string }) | null;
}) {
  const [state, formAction, pending] = useActionState(updateCertificateTemplateAction, initialActionState);
  const logo = useImagePick(value.logoKey);
  const signature = useImagePick(value.signatureKey);
  const err = state.errors ?? {};

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form
      action={(fd) => {
        if (logo.file) fd.set("logo", logo.file);
        if (signature.file) fd.set("signature", signature.file);
        formAction(fd);
      }}
      noValidate
      className="grid gap-6"
    >
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="removeLogo" value={logo.removed ? "1" : "0"} />
      <input type="hidden" name="removeSignature" value={signature.removed ? "1" : "0"} />

      <FormGrid cols={2}>
        <ImageField
          label="Logo"
          id="logo"
          pick={logo}
          error={err.logo}
          hint="PNG, JPG hoặc WEBP, tối đa 1MB. Hiện ở góc trên trái chứng nhận."
          fallbackNote={fallback && !logo.shown && fallback.logoKey ? `Đang dùng logo của ${fallback.companyName}.` : null}
          fallbackKey={fallback && !logo.shown ? fallback.logoKey : null}
        />
        <ImageField
          label="Ảnh chữ ký"
          id="signature"
          pick={signature}
          error={err.signature}
          hint="Khuyến nghị PNG nền trong suốt, tối đa 1MB."
          fallbackNote={fallback && !signature.shown && fallback.signatureKey ? `Đang dùng chữ ký của ${fallback.companyName}.` : null}
          fallbackKey={fallback && !signature.shown ? fallback.signatureKey : null}
        />
        <FormField
          label="Tên người ký"
          htmlFor="signerName"
          error={err.signerName}
          hint={fallback && !value.signerName && fallback.signerName ? `Để trống = đang dùng của ${fallback.companyName}: ${fallback.signerName}` : "VD: Nguyễn Văn An"}
        >
          <Input
            id="signerName"
            name="signerName"
            defaultValue={state.values?.signerName ?? value.signerName}
            maxLength={100}
            autoComplete="off"
            aria-invalid={!!err.signerName}
          />
        </FormField>
        <FormField
          label="Chức vụ người ký"
          htmlFor="signerTitle"
          error={err.signerTitle}
          hint={fallback && !value.signerTitle && fallback.signerTitle ? `Để trống = đang dùng của ${fallback.companyName}: ${fallback.signerTitle}` : "VD: Giám đốc nhân sự"}
        >
          <Input
            id="signerTitle"
            name="signerTitle"
            defaultValue={state.values?.signerTitle ?? value.signerTitle}
            maxLength={150}
            autoComplete="off"
            aria-invalid={!!err.signerTitle}
          />
        </FormField>
      </FormGrid>

      <div className="flex items-center justify-end gap-4 border-t border-border pt-6">
        <a
          href={`/system/certificate-templates/preview?company=${encodeURIComponent(companyId)}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({ variant: "outline" })}
          title="Xem trước bằng mẫu ĐÃ LƯU (lưu trước nếu vừa sửa)"
        >
          <Eye />
          Xem trước PDF
        </a>
        <Button type="submit" disabled={pending}>
          <Save />
          {pending ? "Đang lưu..." : "Lưu mẫu"}
        </Button>
      </div>
    </form>
  );
}

type ImagePick = ReturnType<typeof useImagePick>;

/** Chọn ảnh mới / bỏ ảnh hiện tại; giữ File trong state (form tự reset sau khi gửi). */
function useImagePick(initialKey: string | null) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  return {
    file,
    removed,
    error,
    shown: preview ?? (initialKey && !removed ? fileUrl(initialKey) : null),
    pick(next: File | null) {
      setError(null);
      if (!next) return;
      if (!TYPES.includes(next.type)) return setError("Chỉ nhận ảnh PNG, JPG hoặc WEBP.");
      if (next.size > MAX_BYTES) return setError("Ảnh tối đa 1MB.");
      setFile(next);
      setPreview(URL.createObjectURL(next));
      setRemoved(false);
    },
    clear() {
      setFile(null);
      setPreview(null);
      setRemoved(true);
    },
  };
}

function ImageField({
  label,
  id,
  pick,
  error,
  hint,
  fallbackNote,
  fallbackKey,
}: {
  label: string;
  id: string;
  pick: ImagePick;
  error?: string;
  hint: string;
  fallbackNote: string | null;
  fallbackKey: string | null;
}) {
  const shown = pick.shown;
  return (
    <FormField label={label} htmlFor={`${id}-file`} error={error ?? pick.error ?? undefined} hint={fallbackNote ?? hint}>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-48 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-border bg-muted/40">
          {shown || fallbackKey ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh qua /api/files có kiểm tra đăng nhập
            <img
              src={shown ?? fileUrl(fallbackKey!)}
              alt={label}
              className={cn("max-h-full max-w-full object-contain", !shown && "opacity-50")}
            />
          ) : (
            <span className="text-[13px] text-muted-foreground">Chưa có ảnh</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "cursor-pointer")}>
            <ImagePlus />
            {shown ? "Đổi ảnh" : "Chọn ảnh"}
            <input
              id={`${id}-file`}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => {
                pick.pick(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {shown && (
            <Button type="button" variant="ghost" size="sm" onClick={pick.clear} className="text-destructive">
              <X />
              Bỏ ảnh
            </Button>
          )}
        </div>
      </div>
    </FormField>
  );
}
