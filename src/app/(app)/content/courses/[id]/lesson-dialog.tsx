"use client";

import { useActionState, useEffect, useEffectEvent, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FileText, FileUp, Info, ListChecks, PlayCircle, Trash2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { initialActionState } from "@/lib/action-state";
import { fileUrl } from "@/lib/file-url";
import type { TopicStats } from "@/lib/question-labels";
import { cn } from "@/lib/utils";
import { removeLessonFileAction, updateLessonAction } from "./content-actions";
import type { ContentLesson } from "./content-types";
import { DocumentEditor } from "./document-editor";
import { VideoFields } from "./video-fields";
import { UnsavedChangesDialog, useBeforeUnloadWarning } from "@/components/unsaved-changes-dialog";

const TYPE_META = {
  VIDEO: { label: "Bài video", icon: PlayCircle },
  DOCUMENT: { label: "Bài tài liệu", icon: FileText },
  QUIZ: { label: "Bài kiểm tra", icon: ListChecks },
} as const;

const PDF_MAX_BYTES = 20 * 1024 * 1024;
/** Bản chạy trên Vercel (lưu Vercel Blob): PDF tải THẲNG lên Blob vì Vercel giới hạn request 4,5MB — xem src/lib/storage.ts */
const DIRECT_UPLOAD = process.env.NEXT_PUBLIC_DIRECT_UPLOAD === "1";

/** Tải PDF thẳng lên Vercel Blob rồi nhờ server kiểm tra + gắn vào bài. Trả Response giống cách gửi multipart. */
async function uploadDirect(lessonId: string, picked: File): Promise<Response> {
  const { upload } = await import("@vercel/blob/client");
  const key = `courses/documents/${crypto.randomUUID().replace(/-/g, "")}.pdf`;
  await upload(key, picked, {
    access: "private",
    handleUploadUrl: `/api/lessons/${lessonId}/document/upload`,
    contentType: "application/pdf",
    multipart: picked.size > 5 * 1024 * 1024,
  });
  return fetch(`/api/lessons/${lessonId}/document`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, fileName: picked.name }),
  });
}

/** Dialog chi tiết bài theo loại. Điều khiển bằng open / onOpenChange; cha đổi `key` theo bài để form luôn mới. */
export function LessonDialog({
  lesson,
  open,
  onOpenChange,
  readOnly,
  bunnyEnabled,
  courseId,
  questionBank,
}: {
  lesson: ContentLesson;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  readOnly: boolean;
  bunnyEnabled: boolean;
  courseId: string;
  questionBank: TopicStats;
}) {
  const meta = TYPE_META[lesson.type];
  const Icon = meta.icon;
  // Có thay đổi chưa lưu → Esc / bấm ra ngoài / Huỷ phải hỏi lại trước khi đóng (Việc 33 F9)
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  useBeforeUnloadWarning(open && dirty);

  function requestOpenChange(next: boolean) {
    if (!next && dirty && !readOnly) return setConfirmClose(true);
    if (!next) setDirty(false);
    onOpenChange(next);
  }

  return (
    <>
    <UnsavedChangesDialog
      open={confirmClose}
      description="Bài học có thay đổi chưa lưu. Đóng bây giờ thì các thay đổi này sẽ mất."
      onStay={() => setConfirmClose(false)}
      onDiscard={() => {
        setConfirmClose(false);
        setDirty(false);
        onOpenChange(false);
      }}
    />
    <Dialog open={open} onOpenChange={requestOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-5 text-primary" />
            {meta.label}
            {lesson.isArchived && <span className="text-[13px] font-normal text-muted-foreground">(đã ẩn khỏi học viên)</span>}
          </DialogTitle>
          <DialogDescription>
            {readOnly ? "Bạn chỉ được xem bài này." : "Thay đổi được lưu khi bấm “Lưu thay đổi”."}
          </DialogDescription>
        </DialogHeader>
        <LessonForm
          lesson={lesson}
          readOnly={readOnly}
          bunnyEnabled={bunnyEnabled}
          courseId={courseId}
          questionBank={questionBank}
          onDirty={() => !dirty && setDirty(true)}
          onDone={() => {
            setDirty(false);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
    </>
  );
}

function LessonForm({
  lesson,
  readOnly,
  bunnyEnabled,
  courseId,
  questionBank,
  onDirty,
  onDone,
}: {
  lesson: ContentLesson;
  readOnly: boolean;
  bunnyEnabled: boolean;
  courseId: string;
  questionBank: TopicStats;
  onDirty: () => void;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateLessonAction, initialActionState);
  const err = state.errors ?? {};
  const v = state.values;

  // onDone do cha truyền (hàm mới mỗi lần render) -> đọc qua Effect Event để effect chỉ chạy khi có kết quả mới
  const finish = useEffectEvent(() => onDone());
  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      finish();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state]);

  return (
    <form
      action={formAction}
      noValidate
      className="contents"
      // onInput bắt cả trình soạn tài liệu (contenteditable) — onChange không bắt được
      // Vùng tự lưu riêng (chọn / tải video) không tính là “chưa lưu”
      onChange={(e) => !readOnly && !(e.target as HTMLElement).closest("[data-autosave]") && onDirty()}
      onInput={(e) => !readOnly && !(e.target as HTMLElement).closest("[data-autosave]") && onDirty()}
    >
      <input type="hidden" name="id" value={lesson.id} />
      <DialogBody>
        <fieldset disabled={readOnly || pending} className="min-w-0">
          <FormGrid>
          <FormField label="Tên bài" htmlFor="lesson-title" required error={err.title}>
            <Input
              id="lesson-title"
              name="title"
              defaultValue={v?.title ?? lesson.title}
              maxLength={200}
              autoComplete="off"
              aria-invalid={!!err.title}
            />
          </FormField>

          {lesson.type === "DOCUMENT" && <DocumentFields lesson={lesson} readOnly={readOnly} error={err.content} />}
          {lesson.type === "VIDEO" && (
            <>
              <FormField
                label="% xem tối thiểu để hoàn thành"
                htmlFor="minWatchPercent"
                required
                error={err.minWatchPercent}
                hint="Học viên phải xem thật (không tua) đủ % này mới tính xong bài. Lưu bằng nút “Lưu thay đổi”."
              >
                <Input
                  id="minWatchPercent"
                  name="minWatchPercent"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={v?.minWatchPercent ?? lesson.minWatchPercent}
                  className="w-32"
                  aria-invalid={!!err.minWatchPercent}
                />
              </FormField>
              <div data-autosave className="contents">
                <VideoFields lesson={lesson} bunnyEnabled={bunnyEnabled} readOnly={readOnly} />
              </div>
            </>
          )}
          {lesson.type === "QUIZ" && (
            <QuizFields lesson={lesson} errors={err} values={v} bank={questionBank} courseId={courseId} />
          )}
          </FormGrid>
        </fieldset>
      </DialogBody>

      {readOnly ? (
        // Chế độ chỉ xem: footer chỉ có “Đóng” (ui-review #47)
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" />}>Đóng</DialogClose>
        </DialogFooter>
      ) : (
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu thay đổi"}
          </Button>
        </DialogFooter>
      )}
    </form>
  );
}

// --- TÀI LIỆU -----------------------------------------------------------------------------------

function DocumentFields({ lesson, readOnly, error }: { lesson: ContentLesson; readOnly: boolean; error?: string }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ key: string; name: string } | null>(
    lesson.fileKey ? { key: lesson.fileKey, name: lesson.fileName ?? "tai-lieu.pdf" } : null,
  );
  const [uploading, setUploading] = useState(false);
  const [removing, startRemoving] = useTransition();

  async function upload(picked: File | undefined) {
    if (!picked) return;
    if (inputRef.current) inputRef.current.value = "";
    // Báo sớm ở trình duyệt; server vẫn kiểm tra lại theo NỘI DUNG file
    if (picked.size > PDF_MAX_BYTES) return void toast.error("File PDF tối đa 20MB.");

    setUploading(true);
    try {
      let res: Response;
      if (DIRECT_UPLOAD) {
        res = await uploadDirect(lesson.id, picked);
      } else {
        const body = new FormData();
        body.set("file", picked);
        res = await fetch(`/api/lessons/${lesson.id}/document`, { method: "POST", body });
      }
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; fileKey?: string; fileName?: string; error?: string };
      if (!res.ok || !data.ok || !data.fileKey) {
        toast.error(data.error ?? "Không tải được file, vui lòng thử lại.");
        return;
      }
      setFile({ key: data.fileKey, name: data.fileName ?? picked.name });
      toast.success("Đã tải file PDF lên.");
      router.refresh();
    } catch {
      toast.error("Không tải được file, vui lòng thử lại.");
    } finally {
      setUploading(false);
    }
  }

  function remove() {
    startRemoving(async () => {
      const result = await removeLessonFileAction(lesson.id);
      if (result.ok) {
        setFile(null);
        toast.success(result.message ?? "Đã gỡ file.");
      } else {
        toast.error(result.message ?? "Không gỡ được file.");
      }
    });
  }

  return (
    <>
      <FormField
        label="Nội dung"
        htmlFor="lesson-content"
        error={error}
        hint="Phải có nội dung HOẶC file PDF đính kèm. Định dạng ngoài thanh công cụ sẽ bị lọc bỏ khi lưu."
      >
        <DocumentEditor name="content" initialHtml={lesson.content} disabled={readOnly} invalid={!!error} />
      </FormField>

      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[13px] text-foreground">File PDF đính kèm</p>
          {!readOnly && (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="sr-only"
                id="lesson-pdf"
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <Button type="button" variant="outline" size="sm" disabled={uploading || removing} onClick={() => inputRef.current?.click()}>
                <FileUp />
                {uploading ? "Đang tải lên..." : file ? "Thay file" : "Tải PDF lên"}
              </Button>
              {file && (
                <Button type="button" variant="ghost" size="sm" className="text-destructive" disabled={uploading || removing} onClick={remove}>
                  <Trash2 />
                  {removing ? "Đang gỡ..." : "Gỡ file"}
                </Button>
              )}
            </div>
          )}
        </div>
        {file ? (
          <div className="overflow-hidden rounded-md border border-border">
            <p className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-2 text-[13px] text-foreground">
              <FileText className="size-4 text-destructive" />
              <span className="truncate">{file.name}</span>
            </p>
            <iframe src={fileUrl(file.key)} title={`Xem trước ${file.name}`} className="h-[480px] w-full bg-muted" />
          </div>
        ) : (
          <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-[13px] text-muted-foreground">
            Chưa có file. PDF tối đa 20MB — tải lên được lưu ngay, không cần bấm Lưu.
          </p>
        )}
      </div>
    </>
  );
}

// --- KIỂM TRA -----------------------------------------------------------------------------------

const ALL_TOPICS = "__all__";

function QuizFields({
  lesson,
  errors,
  values,
  bank,
  courseId,
}: {
  lesson: ContentLesson;
  errors: Record<string, string>;
  values?: Record<string, string>;
  /** Số câu đang dùng theo chủ đề trong ngân hàng của khoá */
  bank: TopicStats;
  courseId: string;
}) {
  const [showAnswers, setShowAnswers] = useState(values ? values.showAnswers === "1" : lesson.showAnswers);
  const num = (key: keyof ContentLesson) => values?.[key] ?? (lesson[key] === null ? "" : String(lesson[key]));

  // Chủ đề: chọn trong ngân hàng của khoá (kèm số câu đang dùng); chủ đề đang lưu mà không còn câu vẫn hiện "(0 câu)"
  const [topic, setTopic] = useState<string>((values?.questionTopic ?? lesson.questionTopic) || ALL_TOPICS);
  const [count, setCount] = useState(num("questionCount"));
  const named = bank.topics.filter((t): t is { topic: string; count: number } => t.topic !== null);
  const topicItems = [
    { value: ALL_TOPICS, label: `Tất cả chủ đề (${bank.total} câu)` },
    ...named.map((t) => ({ value: t.topic, label: `${t.topic} (${t.count} câu)` })),
    ...(topic !== ALL_TOPICS && !named.some((t) => t.topic === topic) ? [{ value: topic, label: `${topic} (0 câu)` }] : []),
  ];
  const available = topic === ALL_TOPICS ? bank.total : (named.find((t) => t.topic === topic)?.count ?? 0);
  const wanted = Number(count);
  const tooMany = Number.isInteger(wanted) && wanted > available;

  return (
    <>
      <p className="flex items-start gap-2 rounded-md bg-info/16 px-4 py-2.5 text-[13px] text-info">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>
          Mỗi lần làm, hệ thống rút ngẫu nhiên số câu bên dưới từ{" "}
          <Link href={`/content/questions?course=${courseId}`} target="_blank" className="font-medium underline underline-offset-2">
            Ngân hàng câu hỏi
          </Link>{" "}
          của khoá (chỉ câu đang dùng).
        </span>
      </p>
      <input type="hidden" name="questionTopic" value={topic === ALL_TOPICS ? "" : topic} />
      <FormField label="Chủ đề câu hỏi" htmlFor="questionTopic-select" error={errors.questionTopic}>
        <Select items={topicItems} value={topic} onValueChange={(v) => setTopic(v ? String(v) : ALL_TOPICS)}>
          <SelectTrigger id="questionTopic-select" className="w-full" aria-invalid={!!errors.questionTopic}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {topicItems.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <p
        role="status"
        className={cn(
          "-mt-2 flex items-center gap-2 text-[13px]",
          tooMany ? "rounded-md bg-warning/16 px-3 py-2 text-warning" : "text-muted-foreground",
        )}
      >
        {tooMany && <TriangleAlert className="size-4 shrink-0" />}
        Ngân hàng có {available} câu phù hợp
        {tooMany ? ` — ít hơn số câu rút (${wanted}). Thêm câu hỏi hoặc giảm số câu trước khi phát hành.` : "."}
      </p>
      <FormGrid cols={2}>
        <FormField label="Số câu rút ngẫu nhiên" htmlFor="questionCount" required error={errors.questionCount}>
          <Input
            id="questionCount"
            name="questionCount"
            type="number"
            min={1}
            max={200}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            aria-invalid={!!errors.questionCount}
          />
        </FormField>
        <FormField label="Điểm đạt (0–100)" htmlFor="passingScore" required error={errors.passingScore}>
          <Input id="passingScore" name="passingScore" type="number" min={0} max={100} defaultValue={num("passingScore")} aria-invalid={!!errors.passingScore} />
        </FormField>
        <FormField label="Thời gian (phút)" htmlFor="timeLimitMinutes" error={errors.timeLimitMinutes} hint="Để trống = không giới hạn.">
          <Input
            id="timeLimitMinutes"
            name="timeLimitMinutes"
            type="number"
            min={1}
            max={600}
            defaultValue={num("timeLimitMinutes")}
            placeholder="Không giới hạn"
            aria-invalid={!!errors.timeLimitMinutes}
          />
        </FormField>
        <FormField label="Số lần làm tối đa" htmlFor="maxAttempts" error={errors.maxAttempts} hint="Để trống = không giới hạn.">
          <Input
            id="maxAttempts"
            name="maxAttempts"
            type="number"
            min={1}
            max={100}
            defaultValue={num("maxAttempts")}
            placeholder="Không giới hạn"
            aria-invalid={!!errors.maxAttempts}
          />
        </FormField>
      </FormGrid>
      <input type="hidden" name="showAnswers" value={showAnswers ? "1" : "0"} />
      <div className="flex items-start gap-3">
        <Switch id="showAnswers" checked={showAnswers} onCheckedChange={setShowAnswers} className="mt-0.5" />
        <label htmlFor="showAnswers" className="cursor-pointer">
          <span className="block text-[15px] text-foreground">Cho xem đáp án sau khi nộp</span>
          <span className="block text-[13px] text-muted-foreground">
            Học viên xem được đáp án đúng và giải thích khi lượt nộp ĐẠT, hoặc khi đã dùng hết lượt làm bài
            (không giới hạn lượt: chỉ khi đạt) — tránh nộp bài trống để lấy đáp án.
          </span>
        </label>
      </div>
    </>
  );
}
