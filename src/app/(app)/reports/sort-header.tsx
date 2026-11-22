"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { MetricHeader } from "@/components/info-tip";
import type { MetricKey } from "@/lib/report-definitions";

/**
 * Tiêu đề cột bấm để sắp xếp (?sort=&dir=, về trang 1). `metric` -> kèm ⓘ định nghĩa (src/lib/report-definitions.ts).
 * Lần bấm đầu: cột số giảm dần, cột chữ tăng dần.
 */
export function SortHeader({ field, label, metric, text = false }: { field: string; label?: string; metric?: MetricKey; text?: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("sort") === field;
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const params = new URLSearchParams(searchParams.toString());
  params.set("sort", field);
  params.set("dir", active ? (dir === "asc" ? "desc" : "asc") : text ? "asc" : "desc");
  params.delete("page");

  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <Link href={`${pathname}?${params.toString()}`} scroll={false} className="inline-flex items-center gap-1 hover:text-primary">
        {metric ? <MetricHeaderLabel metric={metric} label={label} /> : label}
        {active ? dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
      </Link>
    </span>
  );
}

/** Nhãn + ⓘ; ⓘ nằm trong link nhưng là nút riêng (không chuyển trang khi bấm). */
function MetricHeaderLabel({ metric, label }: { metric: MetricKey; label?: string }) {
  return (
    <span onClickCapture={(e) => (e.target as HTMLElement).closest("button") && e.preventDefault()}>
      <MetricHeader metric={metric} label={label} />
    </span>
  );
}
