"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight, Search, X } from "lucide-react";
import { EmptyFiltered } from "@/components/empty-state";
import { Input } from "@/components/ui/input";
import type { HelpSearchEntry } from "@/lib/help";
import { normalizeSearch } from "@/lib/tree";

const MAX_RESULTS = 8;

/** Tìm trong nội dung hướng dẫn (chỉ các chương người dùng được xem). Gõ không dấu vẫn tìm được. */
export function HelpSearch({ entries }: { entries: HelpSearchEntry[] }) {
  const [query, setQuery] = useState("");
  const q = normalizeSearch(query);

  const results = useMemo(() => {
    if (q.length < 2) return [];
    const words = q.split(/\s+/).filter(Boolean);
    return entries
      .map((e) => ({ e, score: words.every((w) => e.haystack.includes(w)) ? (normalizeSearch(e.title).includes(q) ? 2 : 1) : 0 }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((r) => r.e);
  }, [entries, q]);

  return (
    <section className="rounded-md bg-card p-4 shadow-md sm:p-6" aria-label="Tìm trong hướng dẫn">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm: đổi mật khẩu, giao khoá…"
          aria-label="Tìm trong hướng dẫn"
          className="h-11 pr-11 pl-10"
          maxLength={100}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Xoá từ khoá"
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-muted-foreground outline-none hover:text-foreground focus-visible:text-primary"
          >
            <X className="size-5" />
          </button>
        )}
      </div>

      {q.length >= 2 &&
        (results.length === 0 ? (
          <EmptyFiltered size="sm" />
        ) : (
          <div className="mt-4">
            <p className="mb-2 text-[13px] text-muted-foreground" aria-live="polite">
              {results.length} mục phù hợp{results.length > MAX_RESULTS ? ` — hiện ${MAX_RESULTS} mục đầu` : ""}
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {results.slice(0, MAX_RESULTS).map((r) => (
                <li key={`${r.chapterId}-${r.sectionId}`}>
                  <Link
                    href={`/help?c=${r.chapterId}#${r.sectionId}`}
                    onClick={() => setQuery("")}
                    className="flex min-h-[44px] items-center gap-3 px-4 py-2.5 outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-foreground">{r.title}</span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {r.chapterTitle} · {r.excerpt}
                      </span>
                    </span>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
