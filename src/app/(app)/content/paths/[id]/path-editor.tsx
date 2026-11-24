"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import Link from "next/link";
import type { CourseStatus } from "@prisma/client";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArchiveRestore, ChevronLeft, GripVertical, Plus, Rocket, Route, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { CourseStatusBadge } from "@/components/course-status-badge";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { FormField, FormGrid } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { formatDuration, formatNumber } from "@/lib/format";
import { normalizeSearch } from "@/lib/tree";
import { cn } from "@/lib/utils";
import {
  addCourseAction,
  appendCourseAction,
  archivePathAction,
  publishPathAction,
  removeCourseAction,
  reorderCoursesAction,
  restorePathAction,
  updatePathInfoAction,
} from "../actions";
import { Tooltip } from "@/components/ui/tooltip";
import type { ActionState } from "@/lib/action-state";

export type PathCourseRow = {
  id: string;
  code: string;
  title: string;
  status: CourseStatus;
  thumbnailUrl: string | null;
  ownerCode: string;
  lessonCount: number;
  videoSeconds: number;
};
export type SelectableCourse = { id: string; code: string; title: string; ownerCode: string };

type PathInfo = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  status: CourseStatus;
  ownerCompany: { code: string; name: string };
};

export function PathEditor({
  path,
  canEdit,
  learnerCount,
  courses,
  selectable,
}: {
  path: PathInfo;
  canEdit: boolean;
  learnerCount: number;
  courses: PathCourseRow[];
  selectable: SelectableCourse[];
}) {
  const isDraft = path.status === "DRAFT";
  const notPublished = courses.filter((c) => c.status !== "PUBLISHED");

  return (
    <div className="space-y-6">
      <PathHeader path={path} canEdit={canEdit} learnerCount={learnerCount} courses={courses} />

      {!canEdit && (
        <p className="rounded-md bg-muted px-4 py-3 text-[15px] text-muted-foreground">
          Lộ trình của công ty {path.ownerCompany.code} — bạn chỉ xem, không sửa được.
        </p>
      )}

      {path.status === "PUBLISHED" && notPublished.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-warning/40 bg-warning/10 px-4 py-3 text-[15px] text-foreground">
          <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning" />
          <p>
            Lộ trình có khoá đã lưu trữ / không còn phát hành: <b>{notPublished.map((c) => c.code).join(", ")}</b>. Người được giao lộ
            trình từ bây giờ sẽ không nhận các khoá này; lượt học đã giao vẫn giữ nguyên.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="rounded-md bg-card p-6 shadow-md">
          <div className="mb-4 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-foreground">Khoá học trong lộ trình</h2>
              <p className="text-[13px] text-muted-foreground">
                {isDraft
                  ? "Kéo thả để đổi thứ tự. Học viên học xong khoá trước mới mở khoá sau."
                  : "Lộ trình đã phát hành: không đổi thứ tự / bỏ khoá được, chỉ thêm khoá vào cuối."}
              </p>
            </div>
            <span className="shrink-0 text-[13px] whitespace-nowrap text-muted-foreground">{formatNumber(courses.length)} khoá</span>
          </div>

          <CourseList key={courses.map((c) => c.id).join(",")} pathId={path.id} courses={courses} editable={canEdit && isDraft} />

          {canEdit && path.status !== "ARCHIVED" && (
            <AddCourse pathId={path.id} published={path.status === "PUBLISHED"} learnerCount={learnerCount} selectable={selectable} />
          )}
        </section>

        <section className="h-fit rounded-md bg-card p-6 shadow-md">
          <h2 className="mb-4 text-lg font-medium text-foreground">Thông tin lộ trình</h2>
          <InfoForm path={path} readOnly={!canEdit} />
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function PathHeader({
  path,
  canEdit,
  learnerCount,
  courses,
}: {
  path: PathInfo;
  canEdit: boolean;
  learnerCount: number;
  courses: PathCourseRow[];
}) {
  const archived = path.status === "ARCHIVED";
  const notPublished = courses.filter((c) => c.status !== "PUBLISHED");
  const publishBlocked = !canEdit
    ? `Chỉ công ty sở hữu (${path.ownerCompany.code}) hoặc Admin tập đoàn mới phát hành được.`
    : courses.length < 2
      ? "Lộ trình cần ít nhất 2 khoá học."
      : notPublished.length > 0
        ? `Khoá chưa phát hành / đã lưu trữ: ${notPublished.map((c) => c.code).join(", ")}.`
        : null;

  return (
    <div className="space-y-3">
      <Link href="/content/paths" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-4" />
        Lộ trình học
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-md bg-card p-6 shadow-md">
        <div className="flex min-w-[min(100%,28rem)] flex-1 items-center gap-4">
          <span className="flex size-14 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Route className="size-7" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <h1 className="line-clamp-2 text-2xl leading-snug font-medium break-words text-foreground" title={path.title}>
              {path.title}
            </h1>
            <div className="flex flex-wrap items-center gap-3 text-[13px] text-muted-foreground">
              <span>{path.code}</span>
              <CourseStatusBadge status={path.status} />
              <span title={path.ownerCompany.name}>Công ty {path.ownerCompany.code}</span>
              <span className="whitespace-nowrap">{formatNumber(learnerCount)} người đang được giao</span>
            </div>
          </div>
        </div>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-4">
            {archived ? (
              <ConfirmDialog
                trigger={
                  <Button variant="outline">
                    <ArchiveRestore />
                    Khôi phục
                  </Button>
                }
                title={`Khôi phục lộ trình ${path.code}?`}
                description="Lộ trình từng phát hành sẽ về Đã phát hành (giao được tiếp); chưa từng phát hành sẽ về Nháp."
                confirmLabel="Khôi phục"
                action={restorePathAction.bind(null, path.id)}
              />
            ) : (
              <ConfirmDialog
                trigger={
                  <Button variant="outline">
                    <Archive />
                    Lưu trữ
                  </Button>
                }
                title={`Lưu trữ lộ trình ${path.code}?`}
                description="Lộ trình lưu trữ không giao mới được (thủ công lẫn quy tắc). Lượt học đã giao vẫn giữ nguyên."
                confirmLabel="Lưu trữ"
                tone="destructive"
                action={archivePathAction.bind(null, path.id)}
              />
            )}
            {path.status === "DRAFT" &&
              (publishBlocked ? (
                <span title={publishBlocked} className="cursor-not-allowed">
                  <Button disabled>
                    <Rocket />
                    Phát hành
                  </Button>
                </span>
              ) : (
                <ConfirmDialog
                  trigger={
                    <Button>
                      <Rocket />
                      Phát hành
                    </Button>
                  }
                  title={`Phát hành lộ trình ${path.code}?`}
                  description={`Lộ trình gồm ${courses.length} khoá. Sau khi phát hành sẽ giao được cho học viên; không đổi thứ tự hay bỏ khoá được nữa — chỉ thêm khoá vào cuối.`}
                  confirmLabel="Phát hành"
                  action={publishPathAction.bind(null, path.id)}
                />
              ))}
          </div>
        )}
      </div>
      {canEdit && path.status === "DRAFT" && publishBlocked && (
        <p className="text-[13px] text-muted-foreground">Chưa phát hành được: {publishBlocked}</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function CourseList({ pathId, courses, editable }: { pathId: string; courses: PathCourseRow[]; editable: boolean }) {
  const [items, setItems] = useState(courses);
  const [pending, startTransition] = useTransition();
  // id cố định (useId giống nhau ở server và trình duyệt) — không có thì dnd-kit tự đếm id cho aria-describedby → lệch hydrate
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-dashed px-6 py-10 text-center">
        <p className="text-[15px] text-foreground">Chưa có khoá học nào</p>
        <p className="text-[13px] text-muted-foreground">Thêm ít nhất 2 khoá đã phát hành để phát hành lộ trình.</p>
      </div>
    );
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((c) => c.id === active.id);
    const to = items.findIndex((c) => c.id === over.id);
    if (from < 0 || to < 0) return;
    const before = items;
    const next = arrayMove(items, from, to);
    setItems(next);
    startTransition(async () => {
      // Lỗi mạng / server → trả lại thứ tự cũ + báo (ui-review F8)
      try {
        const r = await reorderCoursesAction(
          pathId,
          next.map((c) => c.id),
        );
        if (!r.ok) {
          setItems(before);
          toast.error(r.message ?? "Không lưu được thứ tự.");
        }
      } catch {
        setItems(before);
        toast.error("Không lưu được thứ tự, vui lòng thử lại.");
      }
    });
  }

  /** Bỏ khoá — chạy sau hộp xác nhận (ConfirmDialog tự báo kết quả / lỗi). */
  function remove(course: PathCourseRow) {
    return removeCourseAction(pathId, course.id);
  }

  const list = (
    <ol className={cn("divide-y rounded-md border", pending && "opacity-70")} aria-busy={pending}>
      {items.map((c, i) => (
        <CourseItem key={c.id} index={i} course={c} editable={editable} disabled={pending} onRemove={() => remove(c)} />
      ))}
    </ol>
  );

  if (!editable) return list;
  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        screenReaderInstructions: {
          draggable: "Nhấn Space để nhấc lên, dùng phím mũi tên để di chuyển, Space để thả, Esc để huỷ.",
        },
      }}
    >
      <SortableContext items={items.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        {list}
      </SortableContext>
    </DndContext>
  );
}

function CourseItem({
  index,
  course,
  editable,
  disabled,
  onRemove,
}: {
  index: number;
  course: PathCourseRow;
  editable: boolean;
  disabled: boolean;
  onRemove: () => Promise<ActionState>;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: course.id,
    disabled: !editable,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("flex items-center gap-3 bg-card px-3 py-2.5", isDragging && "relative z-10 shadow-lg")}
    >
      {editable && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="cursor-grab touch-none rounded-sm p-1 text-muted-foreground hover:bg-muted active:cursor-grabbing"
          aria-label={`Kéo để đổi thứ tự khoá ${course.code}`}
        >
          <GripVertical className="size-4" />
        </button>
      )}
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[13px] font-medium text-primary">
        {index + 1}
      </span>
      <CourseThumbnail thumbnailKey={course.thumbnailUrl} alt="" className="w-16" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-foreground" title={course.title}>
          {course.title}
        </p>
        <p className="flex flex-wrap items-center gap-x-3 text-[13px] text-muted-foreground">
          <span>{course.code}</span>
          <span>{formatNumber(course.lessonCount)} bài</span>
          <span>Video {formatDuration(course.videoSeconds)}</span>
          {course.status !== "PUBLISHED" && <CourseStatusBadge status={course.status} />}
        </p>
      </div>
      {editable && (
        <ConfirmDialog
          trigger={
            <Tooltip label="Bỏ khỏi lộ trình">
              <Button type="button" variant="ghost" size="icon" disabled={disabled} aria-label={`Bỏ khoá ${course.code} khỏi lộ trình`}>
                <X />
              </Button>
            </Tooltip>
          }
          title={`Bỏ khoá ${course.code} khỏi lộ trình?`}
          description="Lộ trình đang ở trạng thái Nháp nên chưa ai được giao — có thể thêm lại khoá này bất cứ lúc nào."
          confirmLabel="Bỏ khỏi lộ trình"
          tone="destructive"
          action={onRemove}
        />
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------------------------

function AddCourse({
  pathId,
  published,
  learnerCount,
  selectable,
}: {
  pathId: string;
  published: boolean;
  learnerCount: number;
  selectable: SelectableCourse[];
}) {
  const [selected, setSelected] = useState<SelectableCourse | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function addDraft() {
    if (!selected) return;
    startTransition(async () => {
      const r = await addCourseAction(pathId, selected.id);
      if (r.ok) {
        toast.success(r.message);
        setSelected(null);
      } else toast.error(r.message ?? "Không thêm được khoá.");
    });
  }

  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <Combobox
          items={selectable}
          value={selected}
          onValueChange={(c) => setSelected(c)}
          itemToStringLabel={(c) => `${c.code} — ${c.title}`}
          isItemEqualToValue={(a, b) => a.id === b.id}
          filter={(c, query) => {
            const needle = normalizeSearch(query);
            return normalizeSearch(c.code).includes(needle) || normalizeSearch(c.title).includes(needle);
          }}
        >
          <ComboboxInput
            placeholder={selectable.length ? "Chọn khoá đã phát hành để thêm..." : "Không còn khoá đã phát hành nào để thêm"}
            className="w-full"
            aria-label="Khoá học cần thêm"
            disabled={selectable.length === 0 || pending}
          />
          <ComboboxContent>
            <ComboboxEmpty>Không tìm thấy khoá học phù hợp.</ComboboxEmpty>
            <ComboboxList>
              {(c: SelectableCourse) => (
                <ComboboxItem key={c.id} value={c}>
                  <div className="min-w-0">
                    <p className="truncate">{c.title}</p>
                    <p className="truncate text-[13px] text-muted-foreground">
                      {c.code} · Công ty {c.ownerCode}
                    </p>
                  </div>
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </div>

      {published ? (
        <>
          <Button type="button" variant="outline" disabled={!selected} onClick={() => setConfirmOpen(true)}>
            <Plus />
            Thêm khoá vào cuối
          </Button>
          {selected && (
            <ConfirmDialog
              open={confirmOpen}
              onOpenChange={setConfirmOpen}
              title={`Thêm ${selected.code} vào cuối lộ trình?`}
              description={`Khoá này sẽ được tự giao cho ${formatNumber(learnerCount)} người đang có lộ trình (cùng hạn lộ trình của từng người). Đã thêm thì không bỏ ra được.`}
              confirmLabel="Thêm và giao"
              action={async () => {
                const r = await appendCourseAction(pathId, selected.id);
                if (r.ok) setSelected(null);
                return r;
              }}
            />
          )}
        </>
      ) : (
        <Button type="button" variant="outline" disabled={!selected || pending} onClick={addDraft}>
          <Plus />
          {pending ? "Đang thêm..." : "Thêm khoá"}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function InfoForm({ path, readOnly }: { path: PathInfo; readOnly: boolean }) {
  const [state, formAction, pending] = useActionState(updatePathInfoAction, initialActionState);
  const err = state.errors ?? {};

  useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
  }, [state]);

  return (
    <form action={formAction} noValidate>
      <input type="hidden" name="id" value={path.id} />
      <FormGrid>
        <FormField label="Mã lộ trình" htmlFor="path-code" span="full" hint="Mã không đổi được sau khi tạo.">
          <Input id="path-code" value={path.code} disabled readOnly />
        </FormField>
        <FormField label="Tên lộ trình" htmlFor="path-title" span="full" required error={err.title}>
          <Input
            id="path-title"
            name="title"
            defaultValue={state.values?.title ?? path.title}
            maxLength={200}
            disabled={readOnly}
            aria-invalid={!!err.title}
          />
        </FormField>
        <FormField label="Mô tả" htmlFor="path-description" span="full" error={err.description}>
          <Textarea
            id="path-description"
            name="description"
            rows={5}
            maxLength={2000}
            defaultValue={state.values?.description ?? path.description ?? ""}
            disabled={readOnly}
            placeholder="Lộ trình dành cho ai, học xong đạt được gì..."
            aria-invalid={!!err.description}
          />
        </FormField>
      </FormGrid>
      {!readOnly && (
        <div className="mt-4 flex justify-end">
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </div>
      )}
    </form>
  );
}
