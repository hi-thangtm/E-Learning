"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useUpdateSearchParams } from "./use-update-search-params";

/** Ô tìm kiếm: chờ 400ms sau khi ngừng gõ rồi mới cập nhật ?q= trên URL. */
export function DataTableSearch({ placeholder = "Tìm kiếm..." }: { placeholder?: string }) {
  const { update, pending, searchParams } = useUpdateSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);
  const [prevUrlQ, setPrevUrlQ] = useState(urlQ);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // URL đổi từ nơi khác (VD: bấm "Xoá bộ lọc") -> đồng bộ lại ô nhập
  if (urlQ !== prevUrlQ) {
    setPrevUrlQ(urlQ);
    if (urlQ !== value.trim()) setValue(urlQ);
  }

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function handleChange(next: string) {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => update({ q: next.trim() || null }), 400);
  }

  return (
    <div className="relative w-64">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pr-9 pl-9"
      />
      {pending && (
        <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
    </div>
  );
}
