"use client";

import { useActionState, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Save, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { SegmentedControl } from "@/components/segmented-control";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ActionState } from "@/lib/action-state";
import type { LarkSettingsView } from "@/lib/lark/client";
import { clearLarkCredentialsAction, saveLarkCredentialsAction } from "./actions";
import { LarkTestButton } from "./lark-controls";

const DOMAIN_OPTIONS = [
  { value: "larksuite" as const, label: "Lark quốc tế (larksuite.com)" },
  { value: "feishu" as const, label: "Feishu (feishu.cn)" },
];

/**
 * Cấu hình kết nối Lark nhập trên giao diện (Việc L1): App ID, App Secret, máy chủ.
 * App Secret không bao giờ hiện lại (chỉ “••••” + 4 ký tự cuối); để trống khi lưu = giữ secret cũ.
 */
export function LarkCredentialsForm({ view }: { view: LarkSettingsView }) {
  const [state, formAction, pending] = useActionState(saveLarkCredentialsAction, {} as ActionState);
  const [domain, setDomain] = useState<"larksuite" | "feishu">(view.domain === "feishu" ? "feishu" : "larksuite");
  const [showSecret, setShowSecret] = useState(false);
  const err = state.errors ?? {};
  const hasStoredSecret = view.source === "ui" && !view.secretUnreadable;

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  const status =
    view.source === "ui" ? (
      <StatusBadge tone="success">Đã cấu hình trên giao diện</StatusBadge>
    ) : view.source === "env" ? (
      <StatusBadge tone="info">Đang dùng file .env</StatusBadge>
    ) : (
      <StatusBadge tone="secondary">Chưa cấu hình</StatusBadge>
    );

  return (
    <section className="rounded-md bg-card shadow-md" aria-labelledby="lark-status">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-6">
        <div className="space-y-1">
          <h2 id="lark-status" className="flex flex-wrap items-center gap-3 text-lg font-medium text-foreground">
            Cấu hình kết nối {status}
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Lấy App ID / App Secret ở Lark Developer › app tự xây › Credentials &amp; Basic Info. Cần cấp quyền đọc danh bạ và phạm vi Toàn bộ thành viên (docs/lark-setup.md).
          </p>
        </div>
        {view.source && !view.secretUnreadable && <LarkTestButton />}
      </header>

      <form action={formAction} className="grid gap-6 p-6" noValidate>
        {view.secretUnreadable && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-warning/16 px-4 py-2.5 text-[13px] text-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Không đọc được App Secret đã lưu (khoá máy chủ AUTH_SECRET đã đổi) — vui lòng nhập lại App Secret.
          </p>
        )}
        {view.source === "env" && (
          <p className="rounded-md bg-info/16 px-4 py-2.5 text-[13px] text-info">
            Đang dùng LARK_APP_ID / LARK_APP_SECRET trong file .env của máy chủ. Lưu cấu hình ở đây sẽ được ưu tiên hơn file .env.
          </p>
        )}
        <input type="hidden" name="domain" value={domain} />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <FormField label="App ID" htmlFor="lark-app-id" required error={err.appId} hint="VD: cli_a1b2c3d4e5f6g7h8">
            <Input
              id="lark-app-id"
              name="appId"
              defaultValue={state.values?.appId ?? (view.source === "ui" ? (view.appId ?? "") : "")}
              placeholder={view.source === "env" ? (view.appId ?? "") : "cli_..."}
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              aria-invalid={!!err.appId}
            />
          </FormField>
          <FormField
            label="App Secret"
            htmlFor="lark-app-secret"
            required={!hasStoredSecret}
            error={err.appSecret}
            hint={hasStoredSecret ? `Đã lưu (${view.secretHint}) — để trống nếu không đổi.` : "Không hiển thị lại sau khi lưu."}
          >
            <div className="relative">
              <Input
                id="lark-app-secret"
                name="appSecret"
                type={showSecret ? "text" : "password"}
                placeholder={hasStoredSecret ? "••••••••••••" : "Dán App Secret"}
                autoComplete="new-password"
                spellCheck={false}
                maxLength={128}
                className="pr-11"
                aria-invalid={!!err.appSecret}
              />
              <button
                type="button"
                onClick={() => setShowSecret((v) => !v)}
                aria-label={showSecret ? "Ẩn App Secret" : "Hiện App Secret"}
                aria-pressed={showSecret}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:text-primary"
              >
                {showSecret ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </FormField>
          <FormField label="Máy chủ Lark" htmlFor="lark-domain" error={err.domain} hint={view.domain === "custom" ? `File .env đang trỏ tới ${view.domainUrl}` : undefined}>
            <SegmentedControl id="lark-domain" ariaLabel="Máy chủ Lark" options={DOMAIN_OPTIONS} value={domain} onChange={setDomain} />
          </FormField>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
          {view.source === "ui" && (
            <ConfirmDialog
              trigger={
                <Button type="button" variant="ghost" className="text-destructive">
                  <Trash2 />
                  Xoá cấu hình
                </Button>
              }
              title="Xoá cấu hình Lark?"
              description="App ID / App Secret nhập trên giao diện sẽ bị xoá. Đồng bộ tự động dừng (trừ khi file .env của máy chủ có LARK_*). Dữ liệu người dùng đã đồng bộ giữ nguyên."
              confirmLabel="Xoá"
              tone="destructive"
              action={clearLarkCredentialsAction}
            />
          )}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Save />}
            {pending ? "Đang lưu..." : "Lưu cấu hình"}
          </Button>
        </div>
      </form>
    </section>
  );
}
