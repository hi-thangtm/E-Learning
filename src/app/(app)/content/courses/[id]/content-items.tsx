"use client";

import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  EllipsisVertical,
  Eye,
  EyeOff,
  FileText,
  GripVertical,
  ListChecks,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { formatDuration } from "@/lib/youtube";
import type { ContentLesson, ContentSection } from "./content-types";

export const sectionDndId = (id: string) => `s:${id}`;
export const lessonDndId = (id: string) => `l:${id}`;
export const dropDndId = (id: string) => `d:${id}`;

const ITEM = "mx-1 gap-3 rounded-md px-3 py-2 text-[15px]";

const TYPE_ICON = { VIDEO: PlayCircle, DOCUMENT: FileText, QUIZ: ListChecks } as const;
const TYPE_LABEL = { VIDEO: "Video", DOCUMENT: "Tài liệu", QUIZ: "Kiểm tra" } as const;

export type ItemActions = {
  readOnly: boolean;
  /** Khoá đã phát hành: “Ẩn” thay cho “Xoá hẳn” */
  published: boolean;
  onRenameSection: (section: ContentSection) => void;
  onAddLesson: (section: ContentSection) => void;
  onRemoveSection: (section: ContentSection) => void;
  onRestoreSection: (section: ContentSection) => void;
  onOpenLesson: (lesson: ContentLesson) => void;
  onRemoveLesson: (lesson: ContentLesson) => void;
  onRestoreLesson: (lesson: ContentLesson) => void;
};

/** Nhãn tóm tắt dưới tên bài + có cảnh báo “chưa đủ nội dung” không. */
function lessonSummary(l: ContentLesson): { text: string; warn: boolean } {
  if (l.type === "DOCUMENT") {
    const parts = [l.content ? "Có nội dung" : null, l.fileKey ? "PDF" : null].filter(Boolean);
    return parts.length > 0 ? { text: parts.join(" · "), warn: false } : { text: "Chưa có nội dung", warn: true };
  }
  if (l.type === "VIDEO") {
    const source = l.videoProvider === "BUNNY" ? "Bunny" : l.videoProvider === "YOUTUBE" ? "YouTube" : null;
    if (!source) return { text: `Chưa có video · xem tối thiểu ${l.minWatchPercent}%`, warn: true };
    if (l.videoStatus === "PROCESSING") return { text: `${source} · đang xử lý`, warn: false };
    if (l.videoStatus === "FAILED") return { text: `${source} · xử lý lỗi, cần tải lại`, warn: true };
    return { text: `${source} · ${formatDuration(l.durationSeconds)} · xem tối thiểu ${l.minWatchPercent}%`, warn: false };
  }
  return {
    text: [
      `${l.questionCount ?? "?"} câu`,
      `đạt ${l.passingScore ?? "?"} điểm`,
      l.timeLimitMinutes ? `${l.timeLimitMinutes} phút` : "không giới hạn thời gian",
      l.maxAttempts ? `tối đa ${l.maxAttempts} lần` : "không giới hạn lần",
    ].join(" · "),
    warn: false,
  };
}

// --- Chương -------------------------------------------------------------------------------------

export function SectionCard({
  section,
  index,
  expanded,
  onToggle,
  actions,
  dragging,
}: {
  section: ContentSection;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  actions: ItemActions;
  /** Đang kéo một chương -> thu gọn danh sách bài cho dễ thả */
  dragging: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: sectionDndId(section.id),
    disabled: actions.readOnly,
    data: { type: "section" },
  });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const visibleLessons = section.lessons.filter((l) => !l.isArchived).length;

  return (
    <section
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-md border border-border bg-card",
        isDragging && "relative z-10 opacity-80 shadow-lg",
        section.isArchived && "border-dashed",
      )}
      aria-label={`Chương ${index + 1}: ${section.title}`}
    >
      <header className={cn("flex items-center gap-2 px-3 py-3", section.isArchived && "opacity-60")}>
        {!actions.readOnly && (
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Kéo để sắp xếp chương “${section.title}”`}
            className="flex size-8 cursor-grab items-center justify-center rounded-md text-foreground/40 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
          >
            <GripVertical className="size-[18px]" />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <ChevronDown className={cn("size-5 shrink-0 text-foreground/45 transition-transform", !expanded && "-rotate-90")} />
          <span className="shrink-0 text-[13px] text-muted-foreground">Chương {index + 1}</span>
          <span className="truncate font-medium text-foreground">{section.title}</span>
          <span className="shrink-0 text-[13px] text-muted-foreground">· {visibleLessons} bài</span>
          {section.isArchived && <StatusBadge tone="secondary">Đã ẩn</StatusBadge>}
        </button>

        {!actions.readOnly &&
          (section.isArchived ? (
            <Button variant="outline" size="sm" onClick={() => actions.onRestoreSection(section)}>
              <Eye />
              Hiện lại
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => actions.onAddLesson(section)}>
                <Plus />
                Thêm bài
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="ghost" size="icon-sm" aria-label={`Thao tác cho chương “${section.title}”`}>
                      <EllipsisVertical className="size-[18px]" />
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-52 rounded-md py-2 shadow-lg ring-0">
                  <DropdownMenuItem className={ITEM} onClick={() => actions.onRenameSection(section)}>
                    <Pencil className="size-[18px]" />
                    Đổi tên
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" className={ITEM} onClick={() => actions.onRemoveSection(section)}>
                    {actions.published ? <EyeOff className="size-[18px]" /> : <Trash2 className="size-[18px]" />}
                    {actions.published ? "Ẩn khỏi học viên" : "Xoá chương"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ))}
      </header>

      {expanded && !dragging && (
        <SortableContext items={section.lessons.map((l) => lessonDndId(l.id))} strategy={verticalListSortingStrategy}>
          <LessonList section={section} actions={actions} />
        </SortableContext>
      )}
    </section>
  );
}

function LessonList({ section, actions }: { section: ContentSection; actions: ItemActions }) {
  // Vùng thả cho chương rỗng / cuối chương
  const { setNodeRef, isOver } = useDroppable({
    id: dropDndId(section.id),
    data: { type: "section-drop", sectionId: section.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("border-t border-border px-3 py-2", isOver && "bg-primary/8", section.isArchived && "opacity-60")}
    >
      {section.lessons.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-muted-foreground">
          {actions.readOnly ? "Chương chưa có bài." : "Chương chưa có bài — bấm “Thêm bài” hoặc kéo bài từ chương khác vào đây."}
        </p>
      ) : (
        <ul className="grid gap-1">
          {section.lessons.map((lesson) => (
            <LessonRow key={lesson.id} lesson={lesson} actions={actions} />
          ))}
        </ul>
      )}
    </div>
  );
}

// --- Bài ------------------------------------------------------------------------------------------

function LessonRow({ lesson, actions }: { lesson: ContentLesson; actions: ItemActions }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lessonDndId(lesson.id),
    disabled: actions.readOnly,
    data: { type: "lesson" },
  });
  const style = { transform: CSS.Translate.toString(transform), transition };
  const Icon = TYPE_ICON[lesson.type];
  const summary = lessonSummary(lesson);

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60",
        isDragging && "relative z-10 bg-card opacity-80 shadow-md",
      )}
    >
      {!actions.readOnly && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Kéo để sắp xếp bài “${lesson.title}”`}
          className="flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-foreground/30 outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <button
        type="button"
        onClick={() => actions.onOpenLesson(lesson)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-md px-1 py-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
          lesson.isArchived && "opacity-55",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/16 text-primary" title={TYPE_LABEL[lesson.type]}>
          <Icon className="size-[18px]" />
          <span className="sr-only">{TYPE_LABEL[lesson.type]}</span>
        </span>
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate text-[15px] text-foreground">{lesson.title}</span>
            {lesson.isArchived && <StatusBadge tone="secondary">Đã ẩn</StatusBadge>}
          </span>
          <span className={cn("flex items-center gap-1 text-[13px]", summary.warn ? "text-warning" : "text-muted-foreground")}>
            {summary.warn && <TriangleAlert className="size-3.5" />}
            {summary.text}
          </span>
        </span>
      </button>

      {!actions.readOnly &&
        (lesson.isArchived ? (
          <Button variant="outline" size="sm" onClick={() => actions.onRestoreLesson(lesson)}>
            <Eye />
            Hiện lại
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="text-foreground/45 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:text-destructive"
            aria-label={actions.published ? `Ẩn bài “${lesson.title}”` : `Xoá bài “${lesson.title}”`}
            title={actions.published ? "Ẩn khỏi học viên" : "Xoá bài"}
            onClick={() => actions.onRemoveLesson(lesson)}
          >
            {actions.published ? <EyeOff className="size-[18px]" /> : <Trash2 className="size-[18px]" />}
          </Button>
        ))}
    </li>
  );
}
