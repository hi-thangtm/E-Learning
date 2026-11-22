"use client";

import Link from "next/link";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  ListChecks,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  PlayCircle,
} from "lucide-react";
import { ProgressBar } from "@/components/progress";
import { Button, buttonVariants } from "@/components/ui/button";
import type { LessonCompletion, OutlineSection } from "@/lib/learning";
import { relock } from "@/lib/learning-sequence";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/youtube";
import { CourseCompletedDialog } from "./course-completed-dialog";

export type ShellMode = "learn" | "preview";

type ShellContext = {
  mode: ShellMode;
  /** Bài đang mở đã xong chưa (cập nhật ngay khi server báo xong) */
  completed: boolean;
  /** Gọi khi server báo bài hiện tại đã xong → ✓, mở khoá bài sau, % mới, chúc mừng nếu xong khoá */
  onLessonCompleted: (completion: LessonCompletion) => void;
  /** Link bài tiếp theo (null = bài cuối / bài sau còn khoá) */
  nextHref: string | null;
};

const Ctx = createContext<ShellContext | null>(null);

export function useLessonShell(): ShellContext {
  const ctx = use(Ctx);
  if (!ctx) throw new Error("useLessonShell phải nằm trong <LessonShell>.");
  return ctx;
}

const LESSON_ICON = { VIDEO: PlayCircle, DOCUMENT: FileText, QUIZ: ListChecks } as const;

/**
 * Khung trang học (feature-spec 2.4) — dùng chung cho trình học và tab "Xem trước" của trang soạn.
 * Thanh trên (quay lại, tên khoá, % , Bài X/Y) · nội dung bài bên trái · mục lục bên phải (thu gọn được).
 * Link sang bài khác do server tính sẵn (`lessonHrefs`), tắt prefetch vì mở trang học có ghi dữ liệu.
 */
export function LessonShell({
  mode,
  course,
  sections: initialSections,
  progressPercent: initialPercent,
  currentLessonId,
  lessonHrefs,
  backHref,
  backLabel,
  myReview = null,
  children,
}: {
  mode: ShellMode;
  course: { id: string; title: string };
  sections: OutlineSection[];
  progressPercent: number;
  currentLessonId: string;
  lessonHrefs: Record<string, string>;
  backHref: string;
  backLabel: string;
  /** Đánh giá đã có của tôi (điền sẵn form đánh giá ở màn chúc mừng) */
  myReview?: { rating: number; comment: string | null } | null;
  children: ReactNode;
}) {
  const [sections, setSections] = useState(initialSections);
  const [percent, setPercent] = useState(initialPercent);
  const [outlineOpen, setOutlineOpen] = useState(true);
  const [celebrate, setCelebrate] = useState<{
    completedAt: string;
    certificateId: string | null;
    nextCourse: { id: string; title: string } | null;
  } | null>(null);

  const flat = sections.flatMap((s) => s.lessons);
  const index = flat.findIndex((l) => l.id === currentLessonId);
  const current = flat[index];
  const prev = index > 0 ? flat[index - 1] : null;
  const next = index >= 0 && index < flat.length - 1 ? flat[index + 1] : null;
  const preview = mode === "preview";
  const currentDone = preview || !!current?.completed;

  function onLessonCompleted(c: LessonCompletion) {
    if (preview) return;
    const already = flat.find((l) => l.id === c.lessonId)?.completed;
    setSections((s) => relock(s, [c.lessonId]));
    setPercent(c.progressPercent);
    if (c.courseCompleted && c.completedAt) setCelebrate({ completedAt: c.completedAt, certificateId: c.certificateId ?? null, nextCourse: c.nextCourse ?? null });
    else if (!already) toast.success("Đã hoàn thành bài học", { description: next ? "Bài tiếp theo đã được mở." : undefined });
  }

  return (
    <Ctx value={{ mode, completed: currentDone, onLessonCompleted, nextHref: next && !next.locked ? (lessonHrefs[next.id] ?? null) : null }}>
      <div className={cn("flex flex-col bg-background", preview ? "h-[calc(100dvh-14rem)] min-h-[600px]" : "h-dvh")}>
        {preview && (
          <p role="status" className="flex items-center gap-2 bg-warning/16 px-6 py-2.5 text-[15px] text-warning">
            <Eye className="size-5 shrink-0" />
            Chế độ xem trước — mở được mọi bài, không khoá tuần tự và không ghi tiến độ học.
          </p>
        )}

        {/* Thanh trên */}
        <header className="flex h-16 shrink-0 items-center gap-4 border-b border-border bg-card px-6 shadow-xs">
          <Link
            href={backHref}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
            title={backLabel}
            prefetch={false}
          >
            <ArrowLeft />
            {backLabel}
          </Link>
          <span aria-hidden className="h-6 w-px bg-border" />
          <h1 className="min-w-0 flex-1 truncate text-lg font-medium text-foreground">{course.title}</h1>
          {!preview && (
            <div className="flex w-56 items-center gap-3">
              <ProgressBar value={percent} label="Tiến độ khoá học" />
              <span className="text-[13px] font-medium text-foreground tabular-nums">{percent}%</span>
            </div>
          )}
          <span className="inline-flex shrink-0 items-center rounded-full bg-primary/16 px-3 py-1 text-[13px] font-medium whitespace-nowrap text-primary tabular-nums">
            Bài {index + 1}/{flat.length}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOutlineOpen((o) => !o)}
            aria-expanded={outlineOpen}
            aria-controls="lesson-outline"
            title={outlineOpen ? "Thu gọn mục lục" : "Mở mục lục"}
          >
            {outlineOpen ? <PanelRightClose /> : <PanelRightOpen />}
            <span className="sr-only">{outlineOpen ? "Thu gọn mục lục" : "Mở mục lục"}</span>
          </Button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Vùng chính */}
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex max-w-[1100px] flex-col gap-6 p-6">
              {children}

              <div className="flex items-center gap-4 rounded-md bg-card p-4 shadow-sm">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] text-muted-foreground">Bài {index + 1}</p>
                  <h2 className="truncate text-lg font-medium text-foreground">{current?.title}</h2>
                </div>
                {prev ? (
                  <Link href={lessonHrefs[prev.id]} prefetch={false} className={buttonVariants({ variant: "outline" })}>
                    <ChevronLeft />
                    Bài trước
                  </Link>
                ) : (
                  <Button variant="outline" disabled>
                    <ChevronLeft />
                    Bài trước
                  </Button>
                )}
                {next ? (
                  currentDone ? (
                    <Link href={lessonHrefs[next.id]} prefetch={false} className={buttonVariants()}>
                      Bài tiếp theo
                      <ChevronRight />
                    </Link>
                  ) : (
                    <span title="Hoàn thành bài này để mở bài tiếp theo">
                      <Button disabled>
                        Bài tiếp theo
                        <ChevronRight />
                      </Button>
                    </span>
                  )
                ) : (
                  <Link href={backHref} prefetch={false} className={buttonVariants({ variant: currentDone ? "default" : "secondary" })}>
                    {preview ? "Xong xem trước" : "Về trang khoá học"}
                  </Link>
                )}
              </div>
            </div>
          </main>

          {/* Mục lục */}
          {outlineOpen && (
            <aside id="lesson-outline" aria-label="Mục lục khoá học" className="w-[360px] shrink-0 overflow-y-auto border-l border-border bg-card">
              <Outline sections={sections} currentLessonId={currentLessonId} lessonHrefs={lessonHrefs} />
            </aside>
          )}
        </div>
      </div>

      {celebrate && (
        <CourseCompletedDialog
          courseTitle={course.title}
          completedAt={celebrate.completedAt}
          certificateId={celebrate.certificateId}
          nextCourse={celebrate.nextCourse}
          courseId={course.id}
          myReview={myReview}
          onClose={() => setCelebrate(null)}
        />
      )}
    </Ctx>
  );
}

function Outline({
  sections,
  currentLessonId,
  lessonHrefs,
}: {
  sections: OutlineSection[];
  currentLessonId: string;
  lessonHrefs: Record<string, string>;
}) {
  const currentRef = useRef<HTMLAnchorElement>(null);
  // Cuộn mục lục tới bài đang mở
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest" });
  }, [currentLessonId]);

  let n = 0;
  return (
    <div className="pb-4">
      <h2 className="px-5 pt-5 pb-3 font-medium text-foreground">Nội dung khoá học</h2>
      {sections.map((s, si) => {
        const done = s.lessons.filter((l) => l.completed).length;
        return (
          <section key={s.id}>
            <div className="flex items-center gap-2 border-y border-border bg-muted/40 px-5 py-2.5">
              <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">
                Chương {si + 1}: {s.title}
              </p>
              <span className="shrink-0 text-[12px] text-muted-foreground tabular-nums">
                {done}/{s.lessons.length}
              </span>
            </div>
            <ul>
              {s.lessons.map((l) => {
                n++;
                const Icon = LESSON_ICON[l.type];
                const isCurrent = l.id === currentLessonId;
                const inner = (
                  <>
                    <Icon className={cn("size-4 shrink-0", isCurrent ? "text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-[14px] leading-snug">
                        {n}. {l.title}
                      </span>
                      {l.durationSeconds ? (
                        <span className="text-[12px] text-muted-foreground">{formatDuration(l.durationSeconds)}</span>
                      ) : null}
                    </span>
                    {l.completed ? (
                      <CheckCircle2 className="size-[18px] shrink-0 text-success" aria-label="Đã hoàn thành" />
                    ) : l.locked ? (
                      <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Chưa mở" />
                    ) : null}
                  </>
                );
                return (
                  <li key={l.id}>
                    {l.locked ? (
                      <div
                        className="flex cursor-not-allowed items-start gap-3 px-5 py-2.5 text-muted-foreground"
                        title="Hoàn thành bài trước để mở"
                        aria-disabled
                      >
                        {inner}
                      </div>
                    ) : (
                      <Link
                        ref={isCurrent ? currentRef : undefined}
                        href={lessonHrefs[l.id]}
                        prefetch={false}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "flex items-start gap-3 border-l-[3px] px-5 py-2.5 transition-colors",
                          isCurrent
                            ? "border-primary bg-primary/16 font-medium text-primary"
                            : "border-transparent text-foreground hover:bg-muted/60",
                        )}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
