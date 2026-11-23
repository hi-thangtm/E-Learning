"use client";

import { useRef, useState, useTransition } from "react";
import {
  closestCorners,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { BookOpen, ChevronsDownUp, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  removeLessonAction,
  removeSectionAction,
  reorderContentAction,
  restoreLessonAction,
  restoreSectionAction,
} from "./content-actions";
import { AddLessonDialog, SectionNameDialog } from "./content-dialogs";
import { sectionDndId, SectionCard, type ItemActions } from "./content-items";
import type { ContentLayout, ContentLesson, ContentSection } from "./content-types";
import { LessonDialog } from "./lesson-dialog";
import type { TopicStats } from "@/lib/question-labels";
import { EmptyState } from "@/components/empty-state";

type Confirm =
  | { kind: "removeSection"; section: ContentSection }
  | { kind: "restoreSection"; section: ContentSection }
  | { kind: "removeLesson"; lesson: ContentLesson }
  | { kind: "restoreLesson"; lesson: ContentLesson };

const parseId = (dndId: string) => ({ kind: dndId[0] as "s" | "l" | "d", id: dndId.slice(2) });
const layoutOf = (sections: ContentSection[]): ContentLayout =>
  sections.map((s) => ({ sectionId: s.id, lessonIds: s.lessons.map((l) => l.id) }));
const sameLayout = (a: ContentSection[], b: ContentSection[]) => JSON.stringify(layoutOf(a)) === JSON.stringify(layoutOf(b));

/**
 * Tab Nội dung: chương + bài, kéo thả (dnd-kit), thêm / sửa / xoá / ẩn.
 * Thứ tự hiển thị đổi ngay trên trình duyệt; thả xong gửi toàn bộ thứ tự lên server (1 transaction).
 * Server lỗi -> trả lại thứ tự trước khi kéo.
 */
export function ContentEditor({
  courseId,
  sections: serverSections,
  readOnly,
  published,
  bunnyEnabled,
  questionBank,
}: {
  courseId: string;
  sections: ContentSection[];
  readOnly: boolean;
  published: boolean;
  /** Đủ biến môi trường Bunny Stream -> cho chọn nguồn Bunny */
  bunnyEnabled: boolean;
  /** Số câu đang dùng theo chủ đề — cho ô chọn chủ đề của bài kiểm tra */
  questionBank: TopicStats;
}) {
  const [sections, setSections] = useState(serverSections);
  // Dữ liệu server đổi (sau mỗi thao tác) -> đồng bộ lại
  const [source, setSource] = useState(serverSections);
  if (source !== serverSections) {
    setSource(serverSections);
    setSections(serverSections);
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeType, setActiveType] = useState<"section" | "lesson" | null>(null);
  const snapshot = useRef<ContentSection[] | null>(null);
  const [saving, startSaving] = useTransition();

  // Dialog / hộp xác nhận
  const [sectionDialog, setSectionDialog] = useState<{ key: number; section: ContentSection | null } | null>(null);
  const [addLessonFor, setAddLessonFor] = useState<ContentSection | null>(null);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const sensors = useSensors(
    // Kéo 6px mới bắt đầu -> bấm nút trong dòng không bị tính là kéo
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sectionOfLesson = (list: ContentSection[], lessonId: string) =>
    list.findIndex((s) => s.lessons.some((l) => l.id === lessonId));

  function onDragStart({ active }: DragStartEvent) {
    snapshot.current = sections;
    setActiveType(parseId(String(active.id)).kind === "s" ? "section" : "lesson");
  }

  /** Bài kéo sang chương khác: chuyển ngay khi rê qua để danh sách đích mở chỗ trống. */
  function onDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const a = parseId(String(active.id));
    if (a.kind !== "l") return;
    const o = parseId(String(over.id));

    setSections((current) => {
      const from = sectionOfLesson(current, a.id);
      const to = o.kind === "l" ? sectionOfLesson(current, o.id) : current.findIndex((s) => s.id === o.id);
      if (from < 0 || to < 0 || from === to) return current;

      const lesson = current[from].lessons.find((l) => l.id === a.id)!;
      const target = current[to].lessons;
      const overIndex = o.kind === "l" ? target.findIndex((l) => l.id === o.id) : target.length;
      return current.map((s, i) => {
        if (i === from) return { ...s, lessons: s.lessons.filter((l) => l.id !== a.id) };
        if (i === to) {
          const lessons = [...s.lessons];
          lessons.splice(overIndex < 0 ? lessons.length : overIndex, 0, lesson);
          return { ...s, lessons };
        }
        return s;
      });
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    setActiveType(null);
    const before = snapshot.current;
    snapshot.current = null;
    if (!before) return;

    let next = sections;
    if (over) {
      const a = parseId(String(active.id));
      const o = parseId(String(over.id));
      if (a.kind === "s" && o.kind === "s" && a.id !== o.id) {
        const from = next.findIndex((s) => s.id === a.id);
        const to = next.findIndex((s) => s.id === o.id);
        next = arrayMove(next, from, to);
      } else if (a.kind === "l" && o.kind === "l" && a.id !== o.id) {
        const si = sectionOfLesson(next, a.id);
        if (si >= 0 && si === sectionOfLesson(next, o.id)) {
          const lessons = next[si].lessons;
          const moved = arrayMove(
            lessons,
            lessons.findIndex((l) => l.id === a.id),
            lessons.findIndex((l) => l.id === o.id),
          );
          next = next.map((s, i) => (i === si ? { ...s, lessons: moved } : s));
        }
      }
    }
    setSections(next);
    if (sameLayout(before, next)) return;

    startSaving(async () => {
      try {
        const result = await reorderContentAction(courseId, layoutOf(next));
        if (!result.ok) {
          toast.error(result.message ?? "Không lưu được thứ tự.");
          setSections(before);
        }
      } catch {
        toast.error("Không lưu được thứ tự, vui lòng thử lại.");
        setSections(before);
      }
    });
  }

  function onDragCancel() {
    setActiveType(null);
    if (snapshot.current) setSections(snapshot.current);
    snapshot.current = null;
  }

  const actions: ItemActions = {
    readOnly,
    published,
    onRenameSection: (section) => setSectionDialog({ key: Date.now(), section }),
    onAddLesson: (section) => setAddLessonFor(section),
    onRemoveSection: (section) => setConfirm({ kind: "removeSection", section }),
    onRestoreSection: (section) => setConfirm({ kind: "restoreSection", section }),
    onOpenLesson: (lesson) => setOpenLessonId(lesson.id),
    onRemoveLesson: (lesson) => setConfirm({ kind: "removeLesson", lesson }),
    onRestoreLesson: (lesson) => setConfirm({ kind: "restoreLesson", lesson }),
  };

  const openLesson = openLessonId ? sections.flatMap((s) => s.lessons).find((l) => l.id === openLessonId) : undefined;
  const totalLessons = sections.reduce((n, s) => n + s.lessons.length, 0);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[15px] text-muted-foreground">
          {sections.length} chương · {totalLessons} bài
          {saving && <span className="ml-2 text-primary">Đang lưu thứ tự...</span>}
          {!readOnly && sections.length > 0 && <span className="ml-2 text-[13px]">Kéo biểu tượng ⋮⋮ để sắp xếp.</span>}
        </p>
        <div className="flex gap-2">
          {sections.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed(collapsed.size > 0 ? new Set() : new Set(sections.map((s) => s.id)))}
            >
              {collapsed.size > 0 ? <ChevronsUpDown /> : <ChevronsDownUp />}
              {collapsed.size > 0 ? "Mở tất cả" : "Thu gọn tất cả"}
            </Button>
          )}
          {!readOnly && (
            <Button onClick={() => setSectionDialog({ key: Date.now(), section: null })}>
              <Plus />
              Thêm chương
            </Button>
          )}
        </div>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Khoá học chưa có nội dung"
          description={readOnly ? "Khoá học này chưa có chương nào." : "Thêm chương đầu tiên, sau đó thêm bài video, tài liệu hoặc bài kiểm tra vào chương."}
          className="rounded-md border border-dashed border-border"
          action={
            !readOnly && (
              <Button onClick={() => setSectionDialog({ key: Date.now(), section: null })}>
                <Plus />
                Thêm chương
              </Button>
            )
          }
        />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={onDragCancel}
          accessibility={{
            screenReaderInstructions: {
              draggable: "Nhấn Space để nhấc lên, dùng phím mũi tên để di chuyển, Space để thả, Esc để huỷ.",
            },
          }}
        >
          <SortableContext items={sections.map((s) => sectionDndId(s.id))} strategy={verticalListSortingStrategy}>
            <div className="grid gap-3">
              {sections.map((section, index) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  index={index}
                  expanded={!collapsed.has(section.id)}
                  dragging={activeType === "section"}
                  onToggle={() =>
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(section.id)) next.delete(section.id);
                      else next.add(section.id);
                      return next;
                    })
                  }
                  actions={actions}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* --- Dialog --- */}
      {sectionDialog && (
        <SectionNameDialog
          key={sectionDialog.key}
          courseId={courseId}
          section={sectionDialog.section}
          open
          onOpenChange={(open) => !open && setSectionDialog(null)}
        />
      )}
      {addLessonFor && (
        <AddLessonDialog
          key={addLessonFor.id}
          section={addLessonFor}
          open
          onOpenChange={(open) => !open && setAddLessonFor(null)}
          onCreated={(lessonId) => setOpenLessonId(lessonId)}
        />
      )}
      {openLesson && (
        <LessonDialog
          key={openLesson.id}
          lesson={openLesson}
          readOnly={readOnly}
          bunnyEnabled={bunnyEnabled}
          courseId={courseId}
          questionBank={questionBank}
          open
          onOpenChange={(open) => !open && setOpenLessonId(null)}
        />
      )}
      {confirm && <ConfirmBox confirm={confirm} published={published} onClose={() => setConfirm(null)} />}
    </div>
  );
}

/** Hộp xác nhận xoá / ẩn / hiện lại — nói rõ “Xoá hẳn” (chưa phát hành) hay “Ẩn khỏi học viên” (đã phát hành). */
function ConfirmBox({ confirm, published, onClose }: { confirm: Confirm; published: boolean; onClose: () => void }) {
  const common = { open: true, onOpenChange: (open: boolean) => !open && onClose() };

  switch (confirm.kind) {
    case "removeSection": {
      const s = confirm.section;
      const n = s.lessons.length;
      return published ? (
        <ConfirmDialog
          {...common}
          title={`Ẩn chương “${s.title}” khỏi học viên?`}
          description="Khoá đã phát hành nên chương không bị xoá hẳn. Học viên sẽ không thấy chương và các bài trong chương, không tính vào tiến độ. Lịch sử học được giữ nguyên, có thể hiện lại bất cứ lúc nào."
          confirmLabel="Ẩn khỏi học viên"
          tone="destructive"
          action={() => removeSectionAction(s.id)}
        />
      ) : (
        <ConfirmDialog
          {...common}
          title={`Xoá hẳn chương “${s.title}”?`}
          description={
            n > 0
              ? `Khoá chưa phát hành nên chương sẽ bị XOÁ HẲN cùng ${n} bài trong chương (kể cả file PDF đính kèm). Không hoàn tác được.`
              : "Khoá chưa phát hành nên chương sẽ bị XOÁ HẲN. Không hoàn tác được."
          }
          confirmLabel="Xoá hẳn"
          tone="destructive"
          action={() => removeSectionAction(s.id)}
        />
      );
    }
    case "restoreSection":
      return (
        <ConfirmDialog
          {...common}
          title={`Hiện lại chương “${confirm.section.title}”?`}
          description="Học viên sẽ thấy lại chương này và các bài đang hiện trong chương."
          confirmLabel="Hiện lại"
          action={() => restoreSectionAction(confirm.section.id)}
        />
      );
    case "removeLesson": {
      const l = confirm.lesson;
      return published ? (
        <ConfirmDialog
          {...common}
          title={`Ẩn bài “${l.title}” khỏi học viên?`}
          description="Khoá đã phát hành nên bài không bị xoá hẳn. Học viên sẽ không thấy bài, bài không tính vào tiến độ. Lịch sử học và kết quả kiểm tra được giữ nguyên, có thể hiện lại."
          confirmLabel="Ẩn khỏi học viên"
          tone="destructive"
          action={() => removeLessonAction(l.id)}
        />
      ) : (
        <ConfirmDialog
          {...common}
          title={`Xoá hẳn bài “${l.title}”?`}
          description={`Khoá chưa phát hành nên bài sẽ bị XOÁ HẲN${l.fileKey ? " cùng file PDF đính kèm" : ""}. Không hoàn tác được.`}
          confirmLabel="Xoá hẳn"
          tone="destructive"
          action={() => removeLessonAction(l.id)}
        />
      );
    }
    case "restoreLesson":
      return (
        <ConfirmDialog
          {...common}
          title={`Hiện lại bài “${confirm.lesson.title}”?`}
          description="Học viên sẽ thấy lại bài này (nếu chương chứa bài đang hiện)."
          confirmLabel="Hiện lại"
          action={() => restoreLessonAction(confirm.lesson.id)}
        />
      );
  }
}
