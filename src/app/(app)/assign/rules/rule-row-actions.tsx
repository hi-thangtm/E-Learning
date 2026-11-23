"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { EllipsisVertical, Pencil, Play, Power } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { disableRuleAction, enableRuleAction } from "./actions";
import { Tooltip } from "@/components/ui/tooltip";

const ITEM = "mx-1 gap-3 rounded-md px-3 py-2 text-[15px]";

/** Menu ⋮ mỗi quy tắc: Sửa, Tắt (2 lựa chọn) / Bật lại. */
export function RuleRowActions({ rule }: { rule: { id: string; name: string; isActive: boolean; notStarted: number } }) {
  const [disableOpen, setDisableOpen] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Tooltip label={`Thao tác cho quy tắc “${rule.name}”`}><Button variant="ghost" size="icon-sm" aria-label={`Thao tác cho quy tắc “${rule.name}”`}>
              <EllipsisVertical className="size-[18px]" />
            </Button></Tooltip>
          }
        />
        <DropdownMenuContent align="end" className="w-52 rounded-md py-2 shadow-lg ring-0">
          <DropdownMenuItem className={ITEM} render={<Link href={`/assign/rules/${rule.id}`} />}>
            <Pencil className="size-[18px]" />
            Sửa
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {rule.isActive ? (
            <DropdownMenuItem variant="destructive" className={ITEM} onClick={() => setDisableOpen(true)}>
              <Power className="size-[18px]" />
              Tắt quy tắc
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem className={ITEM} onClick={() => setEnableOpen(true)}>
              <Play className="size-[18px]" />
              Bật lại
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {disableOpen && <DisableRuleDialog rule={rule} onClose={() => setDisableOpen(false)} />}
      {enableOpen && (
        <ConfirmDialog
          open
          onOpenChange={(open) => !open && setEnableOpen(false)}
          title={`Bật lại quy tắc “${rule.name}”?`}
          description="Quy tắc sẽ giao ngay cho mọi người đang khớp nhóm áp dụng, và tự giao cho người vào nhóm sau này."
          confirmLabel="Bật lại"
          action={() => enableRuleAction(rule.id)}
        />
      )}
    </div>
  );
}

function DisableRuleDialog({ rule, onClose }: { rule: { id: string; name: string; notStarted: number }; onClose: () => void }) {
  const [mode, setMode] = useState<"keep" | "cancelNotStarted">("keep");
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      try {
        const r = await disableRuleAction(rule.id, mode);
        if (r.ok) {
          toast.success(r.message ?? "Đã tắt quy tắc.");
          onClose();
        } else toast.error(r.message ?? "Không tắt được quy tắc.");
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  const options = [
    { value: "keep" as const, title: "Giữ các lượt đã giao", hint: "Mọi người đã được giao vẫn học tiếp như bình thường. Chỉ dừng giao cho người mới." },
    {
      value: "cancelNotStarted" as const,
      title: "Huỷ các lượt CHƯA BẮT ĐẦU của quy tắc này",
      hint: `Huỷ ${rule.notStarted} lượt chưa bắt đầu học. Lượt đang học / đã xong luôn được giữ.`,
    },
  ];

  return (
    <AlertDialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <AlertDialogContent className="sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Tắt quy tắc “{rule.name}”?</AlertDialogTitle>
          <AlertDialogDescription>Người vào nhóm sau này sẽ không còn tự được giao khoá. Chọn cách xử lý các lượt đã giao:</AlertDialogDescription>
        </AlertDialogHeader>
        <div role="radiogroup" aria-label="Xử lý lượt đã giao" className="grid gap-3">
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                mode === o.value ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground",
              )}
            >
              <input
                type="radio"
                name="disable-mode"
                className="mt-1 size-4 accent-primary"
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
              />
              <span>
                <span className="block font-medium text-foreground">{o.title}</span>
                <span className="block text-[13px] text-muted-foreground">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Huỷ</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Đang tắt..." : "Tắt quy tắc"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
