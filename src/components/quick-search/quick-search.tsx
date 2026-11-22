"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, FileText, Loader2, Search, UserRound } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { searchEverything, type QuickSearchItem, type QuickSearchResult } from "./actions";

const EMPTY: QuickSearchResult = { people: [], courses: [], pages: [] };

/**
 * Tìm nhanh trên header (Ctrl + K / ⌘ + K): nhân viên, khoá học, trang — theo phạm vi của người đăng nhập (server action).
 * Gõ ≥ 2 ký tự, chờ 250ms rồi mới tìm; ↑ ↓ để chọn, Enter để mở, Esc để đóng.
 */
export function QuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<{ q: string; data: QuickSearchResult }>({ q: "", data: EMPTY });
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  // Phím tắt Ctrl/⌘ + K
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounce 250ms; chỉ nhận kết quả của lần gõ mới nhất
  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 2) return;
    const t = setTimeout(() => {
      startTransition(async () => {
        try {
          const data = await searchEverything(q);
          if (latest.current === q) setResult({ q, data });
        } catch {
          if (latest.current === q) setResult({ q, data: EMPTY });
        }
      });
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  const q = query.trim();
  const ready = q.length >= 2 && result.q === q;
  const data = ready ? result.data : EMPTY;
  const total = data.people.length + data.courses.length + data.pages.length;

  function go(item: QuickSearchItem) {
    setOpen(false);
    setQuery("");
    router.push(item.href);
  }

  const groups: { key: "people" | "courses" | "pages"; heading: string; icon: typeof Search }[] = [
    { key: "people", heading: "Nhân viên", icon: UserRound },
    { key: "courses", heading: "Khoá học", icon: BookOpen },
    { key: "pages", heading: "Trang", icon: FileText },
  ];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-9 w-72 items-center gap-2 rounded-md border border-border bg-background/60 px-3 text-left text-[13px] text-muted-foreground transition-colors outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Tìm nhanh (Ctrl + K)"
      >
        <Search className="size-4 shrink-0" />
        <span className="flex-1 truncate">Tìm nhân viên, khoá học…</span>
        <kbd className="rounded-sm border border-border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">Ctrl K</kbd>
      </button>

      <CommandDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        title="Tìm nhanh"
        description="Tìm nhân viên, khoá học hoặc trang trong phạm vi của bạn"
        className="sm:max-w-xl"
      >
        <Command shouldFilter={false} loop>
          <CommandInput value={query} onValueChange={setQuery} placeholder="Nhập ít nhất 2 ký tự: tên, mã nhân viên, email, mã khoá…" />
          <CommandList className="max-h-[60vh]">
            {q.length < 2 ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">Gõ tên / mã nhân viên, tên / mã khoá học hoặc tên trang.</p>
            ) : !ready ? (
              <p className="flex items-center justify-center gap-2 px-3 py-6 text-[13px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang tìm…
              </p>
            ) : (
              <>
                <CommandEmpty>{data.rateLimited ? "Bạn thao tác quá nhanh, vui lòng thử lại sau." : <>Không tìm thấy kết quả cho “{q}”.</>}</CommandEmpty>
                {groups.map(({ key, heading, icon: Icon }) =>
                  data[key].length === 0 ? null : (
                    <CommandGroup key={key} heading={heading}>
                      {data[key].map((item) => (
                        <CommandItem key={`${key}:${item.id}`} value={`${key}:${item.id}`} onSelect={() => go(item)} className="gap-3 py-2">
                          <Icon className="text-muted-foreground" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] text-foreground">{item.title}</span>
                            {item.subtitle && <span className="block truncate text-[12px] text-muted-foreground">{item.subtitle}</span>}
                          </span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ),
                )}
              </>
            )}
            {pending && ready && total > 0 && <span className="sr-only">Đang cập nhật kết quả</span>}
          </CommandList>
          <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-[12px] text-muted-foreground">
            <span>↑ ↓ chọn</span>
            <span>Enter mở</span>
            <span>Esc đóng</span>
          </div>
        </Command>
      </CommandDialog>
    </>
  );
}
