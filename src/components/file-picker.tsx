"use client";

import type { Ref } from "react";
import { FileUp } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { formatFileSize } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Ô chọn file tiếng Việt (ui-review #71): nút “Chọn file” + tên file / “Chưa chọn file”,
 * thay cho ô file gốc hiện theo ngôn ngữ trình duyệt (“Choose File / No file chosen”).
 * Input file thật vẫn nằm trong nút (sr-only) → `<label htmlFor={id}>` của FormField và bàn phím vẫn dùng được.
 */
export function FilePicker({
  id,
  accept,
  file,
  onChange,
  disabled = false,
  invalid = false,
  label = "Chọn file",
  ref,
}: {
  id: string;
  accept?: string;
  /** File đang chọn (để hiện tên + dung lượng) */
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
  invalid?: boolean;
  label?: string;
  /** Ref tới input file thật — để xoá lựa chọn (`ref.current.value = ""`) */
  ref?: Ref<HTMLInputElement>;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <label
        className={cn(
          buttonVariants({ variant: "outline" }),
          "shrink-0 cursor-pointer has-focus-visible:border-ring has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
          disabled && "pointer-events-none opacity-50",
          invalid && "border-destructive",
        )}
      >
        <FileUp />
        {label}
        <input
          ref={ref}
          id={id}
          type="file"
          accept={accept}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          className="sr-only"
          onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        />
      </label>
      <span className={cn("min-w-0 truncate text-[15px]", file ? "text-foreground" : "text-muted-foreground")} title={file?.name}>
        {file ? `${file.name} · ${formatFileSize(file.size)}` : "Chưa chọn file"}
      </span>
    </div>
  );
}
