"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import { Bookmark, CheckCircle2, ChevronLeft, ChevronRight, Clock, Loader2, RotateCw, Send, WifiOff } from "lucide-react";
import { saveQuizAnswerAction } from "@/app/(learn)/learn/quiz-actions";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { fileUrl } from "@/lib/file-url";
import type { QuizPaper } from "@/lib/quiz";
import { cn } from "@/lib/utils";

type SaveStatus = "idle" | "saving" | "saved" | "error";

const RETRY_DELAYS = [1000, 2000, 4000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * Màn hình làm bài: 1 câu / trang, đồng hồ theo deadline của server, lưới ô số câu, đánh dấu xem lại.
 * Mỗi lần chọn → lưu ngay lên server (hàng đợi tuần tự, tự thử lại khi lỗi mạng). Xem trước: không lưu.
 */
export function QuizPlayer({
  title,
  paper,
  preview,
  onSubmit,
}: {
  title: string;
  paper: QuizPaper;
  preview: boolean;
  /** Trả về true khi nộp thành công */
  onSubmit: (answers: Record<string, string[]>) => Promise<boolean>;
}) {
  const questions = paper.questions;
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(questions.map((q) => [q.id, q.selected])),
  );
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  // --- Lưu câu trả lời: hàng đợi tuần tự (thứ tự lưu = thứ tự chọn), thử lại khi lỗi ---
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const latestRef = useRef<Record<string, string[]>>(answers);

  function enqueueSave(questionId: string) {
    if (preview || !paper.attemptId) return;
    const attemptId = paper.attemptId;
    setStatus("saving");
    queueRef.current = queueRef.current.then(async () => {
      const selected = latestRef.current[questionId] ?? [];
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          const res = await saveQuizAnswerAction(attemptId, questionId, selected);
          if (res.ok) {
            setFailed((prev) => {
              if (!prev.has(questionId)) return prev;
              const next = new Set(prev);
              next.delete(questionId);
              return next;
            });
            setStatus("saved");
            return;
          }
          // Lỗi nghiệp vụ (hết giờ, đã nộp…) — không thử lại
          setStatus("error");
          setFailed((prev) => new Set(prev).add(questionId));
          return;
        } catch {
          if (attempt < RETRY_DELAYS.length) {
            setStatus("error");
            await sleep(RETRY_DELAYS[attempt]);
          }
        }
      }
      setStatus("error");
      setFailed((prev) => new Set(prev).add(questionId));
    });
  }

  function retryFailed() {
    const ids = [...failed];
    setFailed(new Set());
    setStatus("saving");
    for (const id of ids) enqueueSave(id);
  }

  function choose(questionId: string, optionId: string, multiple: boolean, checked: boolean) {
    const current = latestRef.current[questionId] ?? [];
    const next = multiple ? (checked ? [...current, optionId] : current.filter((id) => id !== optionId)) : [optionId];
    latestRef.current = { ...latestRef.current, [questionId]: next };
    setAnswers(latestRef.current);
    enqueueSave(questionId);
  }

  // --- Đồng hồ: tính theo deadline của server, bù lệch giờ máy ---
  const serverNowMs = new Date(paper.serverNow).getTime();
  const deadlineMs = paper.deadline ? new Date(paper.deadline).getTime() : null;
  // Giờ "theo server" — cập nhật mỗi giây trong effect (lần render đầu dùng giờ server lúc trả đề)
  const [now, setNow] = useState<number | null>(null);
  const left = deadlineMs === null ? null : deadlineMs - (now ?? serverNowMs);

  async function doSubmit() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    setConfirmOpen(false);
    await queueRef.current; // chờ các lần lưu đang chạy
    const ok = await onSubmit(latestRef.current);
    if (!ok) {
      submittedRef.current = false;
      setSubmitting(false);
    }
  }

  const onTimeUp = useEffectEvent(() => {
    void doSubmit();
  });

  useEffect(() => {
    if (deadlineMs === null) return;
    // Lệch giữa đồng hồ máy và server, đo lúc nhận đề
    const offset = serverNowMs - Date.now();
    const id = setInterval(() => {
      const t = Date.now() + offset;
      setNow(t);
      if (t >= deadlineMs) onTimeUp(); // hết giờ → tự nộp
    }, 1000);
    return () => clearInterval(id);
  }, [deadlineMs, serverNowMs]);

  // Rời trang khi đang làm → trình duyệt hỏi xác nhận
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const q = questions[index];
  const multiple = q.type === "MULTIPLE";
  const chosen = answers[q.id] ?? [];
  const answeredCount = questions.filter((x) => (answers[x.id] ?? []).length > 0).length;
  const unanswered = questions.length - answeredCount;
  const isFlagged = flagged.has(q.id);
  const urgent = left !== null && left <= 60_000;

  function requestSubmit() {
    if (unanswered > 0) setConfirmOpen(true);
    else void doSubmit();
  }

  return (
    <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px] lg:gap-6">
      {/* --- Câu hỏi --- */}
      <section className="min-w-0 rounded-md bg-card p-4 shadow-sm sm:p-8" aria-labelledby="quiz-question">
        {/* Điện thoại: đồng hồ gọn dính trên cùng (lưới câu nằm dưới câu hỏi) */}
        {left !== null && (
          <p
            className={cn(
              "sticky top-0 z-10 -mx-4 -mt-4 mb-3 flex items-center justify-between gap-3 rounded-t-md bg-card px-4 py-2.5 text-[13px] shadow-xs lg:hidden",
              urgent ? "text-destructive" : "text-muted-foreground",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="size-4" />
              Còn lại <span className={cn("font-medium tabular-nums", urgent ? "text-destructive" : "text-foreground")}>{formatClock(left)}</span>
            </span>
            <span>
              Đã trả lời {answeredCount}/{questions.length}
            </span>
          </p>
        )}
        <div className="mb-4 flex items-center justify-between gap-4">
          <p className="text-[13px] text-muted-foreground">
            {title} · Câu {index + 1}/{questions.length}
            {preview && " · Làm thử (không lưu)"}
          </p>
          {!preview && <SaveIndicator status={status} failedCount={failed.size} onRetry={retryFailed} />}
        </div>

        <h2 id="quiz-question" className="text-lg font-medium whitespace-pre-line text-foreground">
          {q.content}
        </h2>
        {q.imageKey && (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh qua /api/files có kiểm tra quyền
          <img
            src={fileUrl(q.imageKey)}
            alt="Ảnh minh hoạ câu hỏi"
            className="mt-4 max-h-80 max-w-full rounded-md border border-border object-contain"
          />
        )}
        <p className="mt-4 text-[13px] text-muted-foreground">
          {multiple ? "Chọn tất cả đáp án đúng." : "Chọn 1 đáp án đúng."}
        </p>

        <fieldset className="mt-3 grid gap-3" disabled={submitting}>
          <legend className="sr-only">Phương án trả lời câu {index + 1}</legend>
          {q.options.map((o) => {
            const checked = chosen.includes(o.id);
            return (
              <label
                key={o.id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-start gap-3 rounded-md border px-4 py-3 text-[15px] transition-colors",
                  checked ? "border-primary bg-primary/8 text-foreground" : "border-border hover:border-muted-foreground",
                )}
              >
                <input
                  type={multiple ? "checkbox" : "radio"}
                  name={`q-${q.id}`}
                  checked={checked}
                  onChange={(e) => choose(q.id, o.id, multiple, e.target.checked)}
                  className="mt-0.5 size-5 shrink-0 accent-primary sm:mt-1 sm:size-4"
                />
                <span className="min-w-0 break-words whitespace-pre-line">{o.text}</span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4 sm:mt-8 sm:gap-4 sm:pt-6 max-sm:[&_button]:h-11">
          <Button variant="outline" onClick={() => setIndex((i) => i - 1)} disabled={index === 0}>
            <ChevronLeft />
            Câu trước
          </Button>
          <Button
            variant={isFlagged ? "secondary" : "ghost"}
            onClick={() =>
              setFlagged((prev) => {
                const next = new Set(prev);
                if (next.has(q.id)) next.delete(q.id);
                else next.add(q.id);
                return next;
              })
            }
            aria-pressed={isFlagged}
            className={cn("order-last w-full sm:order-none sm:w-auto", isFlagged && "text-warning")}
          >
            <Bookmark className={cn(isFlagged && "fill-current")} />
            {isFlagged ? "Bỏ đánh dấu" : "Đánh dấu xem lại"}
          </Button>
          {index < questions.length - 1 ? (
            <Button variant="outline" onClick={() => setIndex((i) => i + 1)}>
              Câu sau
              <ChevronRight data-icon="inline-end" />
            </Button>
          ) : (
            <Button onClick={requestSubmit} disabled={submitting}>
              {submitting ? <Loader2 className="animate-spin" /> : <Send />}
              {submitting ? "Đang nộp..." : "Nộp bài"}
            </Button>
          )}
        </div>
      </section>

      {/* --- Cột phải: đồng hồ + lưới câu --- */}
      <aside className="grid gap-4 lg:sticky lg:top-4">
        <div
          className={cn(
            "rounded-md bg-card p-5 text-center shadow-sm",
            left !== null && "hidden lg:block",
            urgent && "bg-destructive/16 text-destructive",
          )}
          role="timer"
          aria-live={urgent ? "assertive" : "off"}
        >
          <p className={cn("flex items-center justify-center gap-2 text-[13px]", urgent ? "text-destructive" : "text-muted-foreground")}>
            <Clock className="size-4" />
            {left === null ? "Không giới hạn thời gian" : "Thời gian còn lại"}
          </p>
          {left !== null && (
            <p className={cn("mt-1 text-3xl font-medium tabular-nums", urgent ? "text-destructive" : "text-foreground")}>
              {formatClock(left)}
            </p>
          )}
        </div>

        <div className="rounded-md bg-card p-5 shadow-sm">
          <p className="mb-3 text-[13px] text-muted-foreground">
            Đã trả lời {answeredCount}/{questions.length}
          </p>
          <nav aria-label="Danh sách câu hỏi" className="grid grid-cols-6 gap-2 sm:grid-cols-10 lg:grid-cols-5">
            {questions.map((x, i) => {
              const done = (answers[x.id] ?? []).length > 0;
              const mark = flagged.has(x.id);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setIndex(i)}
                  aria-current={i === index ? "step" : undefined}
                  aria-label={`Câu ${i + 1}${done ? ", đã trả lời" : ", chưa trả lời"}${mark ? ", đánh dấu xem lại" : ""}`}
                  className={cn(
                    "relative flex h-10 items-center justify-center rounded-md text-[13px] lg:h-9 font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                    done ? "bg-primary/16 text-primary" : "bg-muted text-muted-foreground",
                    i === index && "ring-2 ring-primary",
                    mark && "outline-2 outline-offset-1 outline-warning",
                  )}
                >
                  {i + 1}
                  {mark && <span aria-hidden className="absolute -top-1 -right-1 size-2 rounded-full bg-warning" />}
                </button>
              );
            })}
          </nav>
          <ul className="mt-4 grid gap-1.5 text-[13px] text-muted-foreground">
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm bg-primary/16" /> Đã trả lời
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm bg-muted" /> Chưa trả lời
            </li>
            <li className="flex items-center gap-2">
              <span className="size-3 rounded-sm outline-2 outline-warning" /> Đánh dấu xem lại
            </li>
          </ul>
          <Button className="mt-4 w-full" onClick={requestSubmit} disabled={submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : <Send />}
            {submitting ? "Đang nộp..." : "Nộp bài"}
          </Button>
        </div>
      </aside>

      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Còn {unanswered} câu chưa trả lời. Vẫn nộp?</AlertDialogTitle>
            <AlertDialogDescription>
              Câu chưa trả lời được tính là sai. Sau khi nộp không sửa được câu trả lời.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Làm tiếp</AlertDialogCancel>
            <Button onClick={() => void doSubmit()} disabled={submitting}>
              {submitting ? "Đang nộp..." : "Vẫn nộp bài"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SaveIndicator({ status, failedCount, onRetry }: { status: SaveStatus; failedCount: number; onRetry: () => void }) {
  if (status === "idle") return null;
  if (status === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground" role="status">
        <Loader2 className="size-3.5 animate-spin" />
        Đang lưu…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="flex items-center gap-2 text-[13px] text-destructive" role="alert">
        <WifiOff className="size-3.5" />
        {failedCount > 0 ? "Chưa lưu được câu trả lời." : "Mất kết nối — đang thử lại…"}
        {failedCount > 0 && (
          <Button variant="outline" size="xs" onClick={onRetry}>
            <RotateCw />
            Thử lại
          </Button>
        )}
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-success" role="status">
      <CheckCircle2 className="size-3.5" />
      Đã lưu
    </span>
  );
}
