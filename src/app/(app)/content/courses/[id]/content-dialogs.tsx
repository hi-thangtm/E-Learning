"use client";

import { useState, useTransition } from "react";
import type { LessonType } from "@prisma/client";
import { FileText, ListChecks, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { createLessonAction, createSectionAction, renameSectionAction } from "./content-actions";

/** Thêm chương / đổi tên chương. `section` có = đổi tên. Cha đổi `key` mỗi lần mở. */
export function SectionNameDialog({
  courseId,
  section,
  open,
  onOpenChange,
}: {
  courseId: string;
  section: { id: string; title: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(section?.title ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = section ? await renameSectionAction(section.id, title) : await createSectionAction(courseId, title);
        if (result.ok) {
          if (result.message) toast.success(result.message);
          onOpenChange(false);
        } else {
          setError(result.errors?.title ?? null);
          if (result.message) toast.error(result.message);
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{section ? "Đổi tên chương" : "Thêm chương"}</DialogTitle>
          <DialogDescription>Chương gom các bài học theo chủ đề. Học viên học lần lượt từng chương.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="grid gap-4">
            <FormField label="Tên chương" htmlFor="section-title" required error={error ?? undefined}>
              <Input
                id="section-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Chương 1 — Giới thiệu quy trình"
                maxLength={200}
                autoComplete="off"
                autoFocus
                aria-invalid={!!error}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : section ? "Lưu" : "Thêm chương"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const TYPES: { value: LessonType; label: string; hint: string; icon: typeof PlayCircle }[] = [
  { value: "VIDEO", label: "Video", hint: "Bài giảng video, tính xong khi xem đủ %", icon: PlayCircle },
  { value: "DOCUMENT", label: "Tài liệu", hint: "Nội dung soạn sẵn và / hoặc file PDF", icon: FileText },
  { value: "QUIZ", label: "Kiểm tra", hint: "Rút câu ngẫu nhiên từ ngân hàng câu hỏi", icon: ListChecks },
];

/** Thêm bài: chọn loại → nhập tên → tạo → báo id để mở ngay dialog chi tiết. */
export function AddLessonDialog({
  section,
  open,
  onOpenChange,
  onCreated,
}: {
  section: { id: string; title: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (lessonId: string) => void;
}) {
  const [type, setType] = useState<LessonType>("DOCUMENT");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const result = await createLessonAction(section.id, type, title);
        if (result.ok && result.lessonId) {
          toast.success(result.message ?? "Đã thêm bài.");
          onOpenChange(false);
          onCreated(result.lessonId);
        } else {
          setError(result.errors?.title ?? null);
          if (result.message) toast.error(result.message);
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Thêm bài vào “{section.title}”</DialogTitle>
          <DialogDescription>Chọn loại bài và đặt tên. Sau đó điền chi tiết bài ở bước tiếp theo.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody className="grid gap-4">
            <div role="radiogroup" aria-label="Loại bài" className="grid grid-cols-3 gap-4">
              {TYPES.map((t) => {
                const Icon = t.icon;
                const selected = type === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setType(t.value)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-md border p-4 text-center transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      selected ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground",
                    )}
                  >
                    <span className={cn("flex size-10 items-center justify-center rounded-md", selected ? "bg-primary text-primary-foreground" : "bg-muted text-foreground/60")}>
                      <Icon className="size-5" />
                    </span>
                    <span className="font-medium text-foreground">{t.label}</span>
                    <span className="text-[13px] text-muted-foreground">{t.hint}</span>
                  </button>
                );
              })}
            </div>
            <FormField label="Tên bài" htmlFor="new-lesson-title" required error={error ?? undefined}>
              <Input
                id="new-lesson-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="VD: Bài 1 — Tổng quan"
                maxLength={200}
                autoComplete="off"
                autoFocus
                aria-invalid={!!error}
              />
            </FormField>
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang tạo..." : "Tạo và điền chi tiết"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
