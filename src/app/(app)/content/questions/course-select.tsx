"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { normalizeSearch } from "@/lib/tree";

export type CourseOption = { id: string; code: string; title: string; statusLabel: string };

/** Ô chọn khoá học (có tìm theo mã / tên) — đổi `?course=` và bỏ các bộ lọc của khoá cũ. */
export function CourseSelect({ courses, value }: { courses: CourseOption[]; value: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const selected = courses.find((c) => c.id === value) ?? null;

  return (
    <Combobox
      items={courses}
      value={selected}
      onValueChange={(c) => {
        if (!c || c.id === value) return;
        startTransition(() => router.push(`/content/questions?course=${c.id}`));
      }}
      itemToStringLabel={(c) => `${c.code} — ${c.title}`}
      isItemEqualToValue={(a, b) => a.id === b.id}
      filter={(c, query) => {
        const needle = normalizeSearch(query);
        return normalizeSearch(c.code).includes(needle) || normalizeSearch(c.title).includes(needle);
      }}
    >
      <ComboboxInput
        placeholder="Chọn khoá học..."
        className="w-full"
        aria-label="Khoá học"
        aria-busy={pending}
        disabled={courses.length === 0}
      />
      <ComboboxContent>
        <ComboboxEmpty>Không tìm thấy khoá học phù hợp.</ComboboxEmpty>
        <ComboboxList>
          {(c: CourseOption) => (
            <ComboboxItem key={c.id} value={c}>
              <div className="min-w-0">
                <p className="truncate">{c.title}</p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {c.code} · {c.statusLabel}
                </p>
              </div>
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
