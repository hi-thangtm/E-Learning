import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  BookOpenCheck,
  Building,
  Building2,
  CircleHelp,
  GraduationCap,
  PenLine,
  Rocket,
  Users,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/current-user";
import { buildHelpSearchIndex, helpChaptersFor } from "@/lib/help";
import type { HelpIcon } from "@/lib/help/types";
import { ROLE_LABELS } from "@/lib/roles";
import { getParam, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { HelpBlocks } from "./help-blocks";
import { HelpSearch } from "./help-search";

export const metadata: Metadata = { title: "Hướng dẫn sử dụng" };

const ICONS: Record<HelpIcon, LucideIcon> = {
  start: Rocket,
  learner: GraduationCap,
  team: Users,
  content: PenLine,
  company: Building,
  group: Building2,
  faq: CircleHelp,
};

/** Hướng dẫn sử dụng — mọi vai trò; chỉ hiện các chương / mục đúng vai trò người đang đăng nhập. */
export default async function HelpPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const chapters = helpChaptersFor(user.role);
  const index = chapters.findIndex((c) => c.id === getParam(sp, "c"));
  const current = chapters[Math.max(0, index)];
  const next = chapters[chapters.indexOf(current) + 1];
  const searchIndex = buildHelpSearchIndex(chapters);

  const chapterLinks = (variant: "side" | "pill") =>
    chapters.map((c) => {
      const Icon = ICONS[c.icon];
      const active = c.id === current.id;
      return (
        <Link
          key={c.id}
          href={`/help?c=${c.id}`}
          aria-current={active ? "page" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md text-[15px] whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            variant === "side" ? "min-h-10 px-3 py-2" : "min-h-10 shrink-0 bg-card px-3.5 shadow-xs",
            active ? "bg-primary/16 font-medium text-primary" : "text-foreground hover:bg-muted",
          )}
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          {c.title}
        </Link>
      );
    });

  return (
    <div id="dau-trang">
      <PageHeader
        title="Hướng dẫn sử dụng"
        description={`Cách dùng các chức năng dành cho vai trò ${ROLE_LABELS[user.role]}. Bấm vào ảnh để phóng to.`}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Mục lục — máy tính */}
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4 rounded-md bg-card p-4 shadow-md">
            <nav aria-label="Các chương hướng dẫn" className="space-y-1">
              {chapterLinks("side")}
            </nav>
            <nav aria-label="Mục lục chương này" className="border-t border-border pt-4">
              <p className="px-3 pb-2 text-[13px] font-medium tracking-[0.4px] text-muted-foreground uppercase">Trong chương này</p>
              <ul className="max-h-[calc(100dvh-28rem)] space-y-0.5 overflow-y-auto">
                {current.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block rounded-md px-3 py-1.5 text-[14px] text-muted-foreground hover:bg-muted hover:text-foreground">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        <div className="min-w-0 space-y-6">
          <HelpSearch entries={searchIndex} />

          {/* Chương — điện thoại / máy tính bảng */}
          <nav aria-label="Các chương hướng dẫn" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
            {chapterLinks("pill")}
          </nav>

          <header className="rounded-md bg-card p-4 shadow-md sm:p-6">
            <h2 className="text-lg font-medium text-foreground sm:text-[22px]">{current.title}</h2>
            <p className="mt-1 text-[15px] text-muted-foreground">{current.description}</p>
            <details className="group mt-4 lg:hidden">
              <summary className="flex min-h-10 cursor-pointer items-center text-[15px] font-medium text-primary">Mục lục chương này ({current.sections.length} mục)</summary>
              <ul className="mt-2 space-y-0.5 border-l-2 border-border pl-3">
                {current.sections.map((s) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="block py-1.5 text-[15px] text-muted-foreground hover:text-foreground">
                      {s.title}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          </header>

          {current.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="scroll-mt-24 rounded-md bg-card p-4 shadow-md sm:p-6">
              <h3 id={`${s.id}-title`} className="mb-4 text-lg font-medium text-foreground">
                {s.title}
              </h3>
              <HelpBlocks blocks={s.blocks} />
            </section>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <a href="#dau-trang" className="inline-flex min-h-10 items-center gap-2 text-[15px] text-muted-foreground hover:text-foreground">
              <ArrowUp className="size-4" aria-hidden />
              Lên đầu trang
            </a>
            {next && (
              <Link href={`/help?c=${next.id}`} className="inline-flex min-h-10 items-center gap-2 text-[15px] font-medium text-primary hover:underline">
                <BookOpenCheck className="size-4" aria-hidden />
                Chương tiếp theo: {next.title}
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
