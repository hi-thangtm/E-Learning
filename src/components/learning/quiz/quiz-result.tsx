"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, RotateCcw, X } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { fileUrl } from "@/lib/file-url";
import type { QuizResult } from "@/lib/quiz";
import { cn } from "@/lib/utils";

/** Kết quả: điểm lớn, Đạt / Không đạt, X/Y câu đúng; xem lại từng câu nếu bài cho xem đáp án (xem trước: luôn có). */
export function QuizResultView({
  title,
  result,
  preview,
  canRetry,
  nextHref,
  retrying,
  onRetry,
  onBack,
}: {
  title: string;
  result: QuizResult;
  preview: boolean;
  canRetry: boolean;
  nextHref: string | null;
  retrying: boolean;
  onRetry: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-md bg-card p-8 text-center shadow-sm">
        <p className="text-[13px] text-muted-foreground">
          {title}
          {preview ? " · Kết quả làm thử (không lưu)" : ` · Lần ${result.attemptNo}`}
        </p>
        <p
          className={cn("mt-3 text-[56px] leading-none font-medium tabular-nums", result.passed ? "text-success" : "text-destructive")}
          aria-label={`${result.score} điểm`}
        >
          {result.score}
          <span className="text-2xl text-muted-foreground">/100</span>
        </p>
        <div className="mt-4 flex items-center justify-center gap-3">
          <StatusBadge tone={result.passed ? "success" : "destructive"}>{result.passed ? "Đạt" : "Không đạt"}</StatusBadge>
          <span className="text-[15px] text-foreground">
            {result.correct}/{result.total} câu đúng · điểm đạt {result.passingScore}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft />
            Về thông tin bài
          </Button>
          {canRetry && !result.passed && (
            <Button onClick={onRetry} disabled={retrying}>
              {retrying ? <Loader2 className="animate-spin" /> : <RotateCcw />}
              {preview ? "Làm thử lại" : "Làm lại"}
            </Button>
          )}
          {nextHref && (
            <Link href={nextHref} prefetch={false} className={buttonVariants()}>
              Bài tiếp theo
              <ArrowRight data-icon="inline-end" />
            </Link>
          )}
        </div>
        {!result.details && (
          <p className="mt-6 text-[13px] text-muted-foreground">Bài kiểm tra này không cho xem đáp án sau khi nộp.</p>
        )}
      </section>

      {result.details && (
        <section className="space-y-4">
          <h3 className="text-lg font-medium text-foreground">Xem lại đáp án</h3>
          {result.details.map((q, i) => (
            <article key={q.questionId} className="rounded-md bg-card p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <p className="text-[15px] font-medium whitespace-pre-line text-foreground">
                  Câu {i + 1}. {q.content}
                </p>
                <StatusBadge tone={q.isCorrect ? "success" : "destructive"}>{q.isCorrect ? "Đúng" : "Sai"}</StatusBadge>
              </div>
              {q.imageKey && (
                // eslint-disable-next-line @next/next/no-img-element -- ảnh qua /api/files có kiểm tra quyền
                <img src={fileUrl(q.imageKey)} alt="Ảnh minh hoạ câu hỏi" className="mt-3 max-h-60 rounded-md border border-border object-contain" />
              )}
              <ul className="mt-4 grid gap-2">
                {q.options.map((o) => {
                  const wrongPick = o.selected && !o.isCorrect;
                  return (
                    <li
                      key={o.id}
                      className={cn(
                        "flex items-start gap-3 rounded-md border px-4 py-2.5 text-[15px]",
                        o.isCorrect
                          ? "border-success/40 bg-success/16 text-success"
                          : wrongPick
                            ? "border-destructive/40 bg-destructive/16 text-destructive"
                            : "border-border text-muted-foreground",
                      )}
                    >
                      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                        {o.isCorrect ? <Check className="size-4" /> : wrongPick ? <X className="size-4" /> : null}
                      </span>
                      <span className="flex-1 whitespace-pre-line">{o.text}</span>
                      {o.selected && <span className="shrink-0 text-[13px] font-medium">Bạn đã chọn</span>}
                    </li>
                  );
                })}
              </ul>
              {q.explanation && (
                <p className="mt-4 rounded-md bg-info/16 px-4 py-3 text-[13px] whitespace-pre-line text-info">
                  <strong className="font-medium">Giải thích: </strong>
                  {q.explanation}
                </p>
              )}
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
