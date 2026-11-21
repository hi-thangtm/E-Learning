import Link from "next/link";
import { BookOpen, Eye, Info, Star, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export const COURSE_TABS = ["info", "content", "preview", "reviews"] as const;
export type CourseTab = (typeof COURSE_TABS)[number];

const TABS: { value: CourseTab; label: string; icon: LucideIcon }[] = [
  { value: "info", label: "Thông tin", icon: Info },
  { value: "content", label: "Nội dung", icon: BookOpen },
  { value: "preview", label: "Xem trước", icon: Eye },
  { value: "reviews", label: "Đánh giá", icon: Star },
];

/** Thanh tab dạng link (?tab=...) — render phía server, giữ kiểu tab Vuexy: chữ + gạch chân primary. */
export function CourseTabs({ courseId, active }: { courseId: string; active: CourseTab }) {
  return (
    <nav aria-label="Phần soạn khoá học" className="flex gap-2 border-b border-border px-6">
      {TABS.map((tab) => {
        const selected = tab.value === active;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.value}
            href={tab.value === "info" ? `/content/courses/${courseId}` : `/content/courses/${courseId}?tab=${tab.value}`}
            scroll={false}
            aria-current={selected ? "page" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[15px] transition-colors outline-none focus-visible:bg-primary/8",
              selected
                ? "border-primary font-medium text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-[18px]" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
