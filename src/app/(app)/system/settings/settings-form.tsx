"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { GraduationCap, ImagePlus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { initialActionState, type ActionState } from "@/lib/action-state";
import { SETTING_META, settingKeysOf, type SettingGroup, type SettingKey, type SettingValues } from "@/lib/settings-meta";
import { cn } from "@/lib/utils";
import { removeLogoAction, resetSettingsGroupAction, saveSettingsGroupAction, uploadLogoAction } from "./actions";

const LOGO_TYPES = ["image/png", "image/webp"];
const LOGO_MAX = 500 * 1024;

function useToastOnResult(state: ActionState) {
  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
  }, [state]);
}

/** Thẻ 1 nhóm cài đặt: các ô + Lưu + Khôi phục mặc định. Nhóm Nhận diện có thêm khối Logo. */
export function SettingsGroupCard({
  group,
  title,
  description,
  values,
  logoUrl,
}: {
  group: SettingGroup;
  title: string;
  description: string;
  values: SettingValues;
  /** Nhóm Nhận diện: URL logo hiện tại (null = mặc định) */
  logoUrl?: string | null;
}) {
  const keys = settingKeysOf(group).filter((k) => SETTING_META[k].kind !== "logo");
  // Đổi giá trị từ server (sau khi lưu / khôi phục) -> dựng lại form để ô nhập nhận giá trị mới
  const formKey = keys.map((k) => String(values[k])).join("|");

  return (
    <section className="rounded-md bg-card shadow-md">
      <header className="flex items-start justify-between gap-4 border-b border-border p-6">
        <div>
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          <p className="text-[13px] text-muted-foreground">{description}</p>
        </div>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="shrink-0">
              <RotateCcw />
              Khôi phục mặc định
            </Button>
          }
          title={`Khôi phục mặc định nhóm “${title}”?`}
          description={
            group === "branding"
              ? `Tên hệ thống về “${SETTING_META.SYSTEM_NAME.default}” và logo đã tải lên sẽ bị xoá (dùng biểu tượng mặc định).`
              : `Các mục: ${keys.map((k) => `${SETTING_META[k].label} → ${SETTING_META[k].default}`).join("; ")}.`
          }
          confirmLabel="Khôi phục"
          action={resetSettingsGroupAction.bind(null, group)}
        />
      </header>
      <div className="grid gap-6 p-6">
        {group === "branding" && <LogoField logoUrl={logoUrl ?? null} />}
        <GroupForm key={formKey} group={group} keys={keys} values={values} />
      </div>
    </section>
  );
}

function GroupForm({ group, keys, values }: { group: SettingGroup; keys: SettingKey[]; values: SettingValues }) {
  const [state, formAction, pending] = useActionState(saveSettingsGroupAction, initialActionState);
  useToastOnResult(state);
  const err = state.errors ?? {};

  return (
    <form action={formAction} noValidate className="grid gap-5">
      <input type="hidden" name="group" value={group} />
      <div className="grid grid-cols-2 gap-x-6 gap-y-5">
        {keys.map((k) => {
          const meta = SETTING_META[k];
          const value = state.values?.[k] ?? String(values[k] ?? "");
          if (meta.kind === "string") {
            return (
              <FormField
                key={k}
                label={meta.label}
                htmlFor={k}
                required
                error={err[k]}
                hint={`${meta.description} Mặc định: ${meta.default}.`}
              >
                <Input id={k} name={k} defaultValue={value} maxLength={meta.maxLength} aria-invalid={!!err[k]} />
              </FormField>
            );
          }
          if (meta.kind !== "number") return null;
          return (
            <FormField
              key={k}
              label={meta.label}
              htmlFor={k}
              required
              error={err[k]}
              hint={`${meta.description} Từ ${meta.min} đến ${meta.max} ${meta.unit}. Mặc định: ${meta.default} ${meta.unit}.`}
            >
              <div className="flex items-center gap-2">
                <Input
                  id={k}
                  name={k}
                  type="number"
                  inputMode="numeric"
                  min={meta.min}
                  max={meta.max}
                  step={1}
                  defaultValue={value}
                  className="w-32"
                  aria-invalid={!!err[k]}
                />
                <span className="text-[15px] text-muted-foreground">{meta.unit}</span>
              </div>
            </FormField>
          );
        })}
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          <Save />
          {pending ? "Đang lưu..." : "Lưu thay đổi"}
        </Button>
      </div>
    </form>
  );
}

/** Logo: chọn ảnh → xem trước trên nền sáng → Tải lên; Xoá logo → biểu tượng mặc định. */
function LogoField({ logoUrl }: { logoUrl: string | null }) {
  const [state, formAction, pending] = useActionState(uploadLogoAction, initialActionState);
  useToastOnResult(state);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);


  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  // Tải lên xong -> bỏ ảnh xem trước (logo mới hiện từ server). Cập nhật trong lúc render khi kết quả đổi.
  const [handled, setHandled] = useState(state);
  if (state !== handled) {
    setHandled(state);
    if (state.ok) setPreview(null);
  }

  const shown = preview ?? logoUrl;
  const meta = SETTING_META.SYSTEM_LOGO_KEY;

  return (
    <FormField label={meta.label} htmlFor="logo" error={error ?? state.errors?.logo} hint={meta.description}>
      <form action={formAction} className="flex flex-wrap items-center gap-4">
        <div className="flex h-20 w-56 shrink-0 items-center justify-center gap-2 overflow-hidden rounded-md border border-border bg-white p-3">
          {shown ? (
            // eslint-disable-next-line @next/next/no-img-element -- xem trước ảnh cục bộ (blob:) hoặc logo công khai
            <img src={shown} alt="Xem trước logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <GraduationCap className="size-7 text-primary" />
              Biểu tượng mặc định
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}>
            <ImagePlus />
            Chọn ảnh
            <input
              ref={inputRef}
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                setError(null);
                const f = e.target.files?.[0];
                if (!f) return;
                if (!LOGO_TYPES.includes(f.type)) {
                  setError("Chỉ nhận ảnh PNG hoặc WEBP (không nhận SVG).");
                  e.target.value = "";
                  return;
                }
                if (f.size > LOGO_MAX) {
                  setError("Logo tối đa 500KB.");
                  e.target.value = "";
                  return;
                }
                setPreview(URL.createObjectURL(f));
              }}
            />
          </label>
          {preview && (
            <>
              <Button type="submit" size="sm" disabled={pending}>
                {pending ? "Đang tải lên..." : "Tải lên"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={pending}
                onClick={() => {
                  setPreview(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              >
                Huỷ
              </Button>
            </>
          )}
          {!preview && logoUrl && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" size="sm" className="text-destructive">
                  <Trash2 />
                  Xoá logo
                </Button>
              }
              title="Xoá logo?"
              description="Hệ thống sẽ dùng lại biểu tượng mặc định ở thanh bên, trang đăng nhập và trang tra cứu chứng nhận."
              confirmLabel="Xoá logo"
              tone="destructive"
              action={removeLogoAction}
            />
          )}
        </div>
      </form>
    </FormField>
  );
}
