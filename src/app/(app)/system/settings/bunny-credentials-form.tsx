"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import type { BunnySettingsView } from "@/lib/bunny";
import { clearBunnyCredentialsAction, saveBunnyCredentialsAction } from "./bunny-actions";

type KeyField = "apiKey" | "tokenKey" | "readonlyKey";

/**
 * Nhập khoá Bunny Stream trên giao diện: Library ID, API key, Token key, Read-Only key (tuỳ chọn).
 * Khoá không bao giờ hiện lại (chỉ “••••” + 4 ký tự cuối); để trống khi lưu = giữ khoá cũ.
 */
export function BunnyCredentialsForm({ view }: { view: BunnySettingsView }) {
  const [state, formAction, pending] = useActionState(saveBunnyCredentialsAction, {} as ActionState);
  const [shown, setShown] = useState<Record<KeyField, boolean>>({ apiKey: false, tokenKey: false, readonlyKey: false });
  const [removeReadonly, setRemoveReadonly] = useState(false);
  const err = state.errors ?? {};
  const fromUi = view.source === "ui";

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  // Gợi ý khoá đã lưu (chỉ cấu hình trên giao diện mới “giữ” được khi để trống)
  const stored: Record<KeyField, string | null> = {
    apiKey: fromUi ? view.apiKeyHint : null,
    tokenKey: fromUi ? view.tokenKeyHint : null,
    readonlyKey: fromUi ? view.readonlyKeyHint : null,
  };
  const envHint: Record<KeyField, string | null> = {
    apiKey: view.source === "env" ? view.apiKeyHint : null,
    tokenKey: view.source === "env" ? view.tokenKeyHint : null,
    readonlyKey: view.source === "env" ? view.readonlyKeyHint : null,
  };

  const keyInput = (field: KeyField, label: string, opts: { required: boolean; help: string }) => {
    const id = `bunny-${field}`;
    const hint = stored[field]
      ? `Đã lưu (${stored[field]}) — để trống nếu không đổi.`
      : envHint[field]
        ? `File .env đang dùng ${envHint[field]}. ${opts.help}`
        : opts.help;
    return (
      <FormField label={label} htmlFor={id} required={opts.required && !stored[field]} error={err[field]} hint={hint}>
        <div className="relative">
          <Input
            id={id}
            name={field}
            type={shown[field] ? "text" : "password"}
            placeholder={stored[field] ? "••••••••••••" : `Dán ${label}`}
            autoComplete="new-password"
            spellCheck={false}
            maxLength={200}
            className="pr-11"
            aria-invalid={!!err[field]}
            disabled={field === "readonlyKey" && removeReadonly}
          />
          <button
            type="button"
            onClick={() => setShown((s) => ({ ...s, [field]: !s[field] }))}
            aria-label={shown[field] ? `Ẩn ${label}` : `Hiện ${label}`}
            aria-pressed={shown[field]}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:text-primary"
          >
            {shown[field] ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
          </button>
        </div>
      </FormField>
    );
  };

  return (
    <form action={formAction} className="grid gap-6" noValidate>
      {view.unreadable && (
        <p role="alert" className="flex items-start gap-2 rounded-md bg-warning/16 px-4 py-2.5 text-[13px] text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          Không đọc được khoá đã lưu (khoá máy chủ AUTH_SECRET đã đổi) — vui lòng nhập lại API key, Token key và Read-Only key.
        </p>
      )}
      {view.source === "env" && (
        <p className="rounded-md bg-info/16 px-4 py-2.5 text-[13px] text-info">
          Đang dùng BUNNY_STREAM_* trong file .env của máy chủ. Lưu cấu hình ở đây sẽ được ưu tiên hơn file .env (cần nhập đủ các khoá).
        </p>
      )}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <FormField label="Library ID" htmlFor="bunny-libraryId" required error={err.libraryId} hint="Bunny › Stream › thư viện video › API › Video Library ID (chỉ gồm số).">
          <Input
            id="bunny-libraryId"
            name="libraryId"
            inputMode="numeric"
            defaultValue={state.values?.libraryId ?? (fromUi ? (view.libraryId ?? "") : "")}
            placeholder={view.source === "env" ? (view.libraryId ?? "") : "VD: 123456"}
            autoComplete="off"
            maxLength={12}
            aria-invalid={!!err.libraryId}
          />
        </FormField>
        {keyInput("apiKey", "API key", { required: true, help: "Bunny › thư viện video › API › API Key." })}
        {keyInput("tokenKey", "Token key (xem video)", {
          required: true,
          help: "Bunny › thư viện video › Security › Token Authentication › Token authentication key.",
        })}
        <div className="grid gap-2">
          {keyInput("readonlyKey", "Read-Only key (chữ ký webhook)", {
            required: false,
            help: "Tuỳ chọn — Bunny › thư viện video › API › Read-Only API Key. Có khoá này thì webhook phải có chữ ký đúng.",
          })}
          {stored.readonlyKey && (
            <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <input type="checkbox" name="removeReadonly" className="size-4 accent-destructive" checked={removeReadonly} onChange={(e) => setRemoveReadonly(e.target.checked)} />
              Gỡ Read-Only key (tắt kiểm chữ ký webhook)
            </label>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {fromUi && (
          <ConfirmDialog
            trigger={
              <Button type="button" variant="ghost" className="text-destructive">
                <Trash2 />
                Xoá cấu hình
              </Button>
            }
            title="Xoá cấu hình Bunny Stream?"
            description={
              view.envAvailable
                ? "Khoá nhập trên giao diện sẽ bị xoá; hệ thống quay về dùng khoá trong file .env của máy chủ."
                : "Khoá nhập trên giao diện sẽ bị xoá. Video Bunny sẽ không phát / tải lên được cho tới khi nhập lại khoá. Bài học và video trên Bunny giữ nguyên."
            }
            confirmLabel="Xoá"
            tone="destructive"
            action={clearBunnyCredentialsAction}
          />
        )}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Save />}
          {pending ? "Đang lưu..." : "Lưu cấu hình"}
        </Button>
      </div>
    </form>
  );
}
