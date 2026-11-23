"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { CheckCircle2, Download, FileText, Loader2 } from "lucide-react";
import { markDocumentRead } from "@/app/(learn)/learn/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { fileUrl } from "@/lib/file-url";
import type { LessonCompletion, LessonDetail } from "@/lib/learning";
import { DOCUMENT_MIN_SECONDS } from "@/lib/learning-sequence";
import { LessonContent } from "./lesson-content";
import { useLessonShell } from "./lesson-shell";

type DocumentDetail = Extract<LessonDetail, { type: "DOCUMENT" }>;

/** Bài TÀI LIỆU: nội dung HTML (đã lọc) + PDF xem ngay trong trang; nút “Đã đọc xong” sau 15 giây. */
export function DocumentLesson({ lesson }: { lesson: DocumentDetail }) {
  const { mode, completed, onLessonCompleted } = useLessonShell();
  const empty = !lesson.html && !lesson.fileKey;

  return (
    <div className="space-y-6">
      <article className="rounded-md bg-card p-4 shadow-sm sm:p-8">
        {empty ? (
          <p className="text-[15px] text-muted-foreground">Bài học chưa có nội dung.</p>
        ) : (
          lesson.html && <LessonContent html={lesson.html} />
        )}
      </article>

      {lesson.fileKey && (
        <section className="overflow-hidden rounded-md bg-card shadow-sm">
          <header className="flex items-center gap-3 border-b border-border px-5 py-3">
            <FileText className="size-5 text-destructive" />
            <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-foreground">{lesson.fileName ?? "Tài liệu PDF"}</p>
            <a
              href={fileUrl(lesson.fileKey)}
              download={lesson.fileName ?? "tai-lieu.pdf"}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download />
              Tải PDF
            </a>
          </header>
          <iframe src={fileUrl(lesson.fileKey)} title={lesson.fileName ?? "Tài liệu PDF"} className="h-[75vh] w-full bg-muted" />
        </section>
      )}

      <div className="flex items-center justify-end gap-4">
        {mode === "preview" ? (
          <p className="text-[13px] text-muted-foreground">
            Xem trước: học viên bấm “Đã đọc xong” sau {DOCUMENT_MIN_SECONDS} giây để hoàn thành bài.
          </p>
        ) : completed ? (
          <p className="flex items-center gap-2 text-[15px] text-success">
            <CheckCircle2 className="size-5" />
            Bạn đã đọc xong bài này.
          </p>
        ) : (
          <ReadButton lessonId={lesson.id} onDone={onLessonCompleted} />
        )}
      </div>
    </div>
  );
}

function ReadButton({ lessonId, onDone }: { lessonId: string; onDone: (c: LessonCompletion) => void }) {
  const [left, setLeft] = useState(DOCUMENT_MIN_SECONDS);
  const [pending, startTransition] = useTransition();

  // Đếm ngược từ lúc mở bài (server kiểm tra lại theo thời điểm mở bài)
  useEffect(() => {
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, []);

  function submit() {
    startTransition(async () => {
      const result = await markDocumentRead(lessonId);
      if (result.ok) onDone(result.completion);
      else toast.error(result.error);
    });
  }

  const waiting = left > 0;
  return (
    <div className="flex items-center gap-3">
      {waiting && <p className="text-[13px] text-muted-foreground">Đọc thêm {left} giây để xác nhận</p>}
      <Button size="lg" onClick={submit} disabled={waiting || pending}>
        {pending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
        {waiting ? `Đã đọc xong (${left})` : "Đã đọc xong"}
      </Button>
    </div>
  );
}
