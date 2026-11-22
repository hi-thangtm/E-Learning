"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  previewQuizStartAction,
  previewQuizSubmitAction,
  quizResultAction,
  startQuizAction,
  submitQuizAction,
} from "@/app/(learn)/learn/quiz-actions";
import type { LessonDetail } from "@/lib/learning";
import type { QuizOverview, QuizPaper, QuizResult } from "@/lib/quiz";
import { useLessonShell } from "./lesson-shell";
import { QuizIntro } from "./quiz/quiz-intro";
import { QuizPlayer } from "./quiz/quiz-player";
import { QuizResultView } from "./quiz/quiz-result";

type QuizDetail = Extract<LessonDetail, { type: "QUIZ" }>;

type View = { kind: "intro" } | { kind: "playing"; paper: QuizPaper } | { kind: "result"; result: QuizResult };

/**
 * Bài KIỂM TRA (feature-spec 2.5): giới thiệu → làm bài → kết quả.
 * Học viên: đề + lưu + chấm ở server (src/lib/quiz.ts). Xem trước (người soạn): `overview = null`, làm thử không lưu, luôn hiện đáp án.
 */
export function QuizLesson({ lesson, overview: initialOverview }: { lesson: QuizDetail; overview: QuizOverview | null }) {
  const { mode, onLessonCompleted, nextHref } = useLessonShell();
  const preview = mode === "preview" || !initialOverview;
  const [overview, setOverview] = useState(initialOverview);
  const [view, setView] = useState<View>({ kind: "intro" });
  const [starting, startTransition] = useTransition();

  function start() {
    startTransition(async () => {
      try {
        const res = preview ? await previewQuizStartAction(lesson.id) : await startQuizAction(lesson.id);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setView({ kind: "playing", paper: res.data });
      } catch {
        toast.error("Không mở được bài kiểm tra, vui lòng thử lại.");
      }
    });
  }

  function viewResult(attemptId: string) {
    startTransition(async () => {
      const res = await quizResultAction(attemptId);
      if (!res.ok) toast.error(res.error);
      else setView({ kind: "result", result: res.data });
    });
  }

  /** Nộp bài: trả về false nếu lỗi (người làm bấm nộp lại được). */
  async function submit(paper: QuizPaper, answers: Record<string, string[]>): Promise<boolean> {
    try {
      if (preview || !paper.attemptId) {
        const res = await previewQuizSubmitAction(
          lesson.id,
          paper.questions.map((q) => ({ questionId: q.id, selected: answers[q.id] ?? [] })),
        );
        if (!res.ok) {
          toast.error(res.error);
          return false;
        }
        setView({ kind: "result", result: res.data });
        return true;
      }
      const res = await submitQuizAction(paper.attemptId);
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      setOverview(res.data.overview);
      setView({ kind: "result", result: res.data.result });
      if (res.data.completion) onLessonCompleted(res.data.completion);
      return true;
    } catch {
      toast.error("Không nộp được bài — kiểm tra kết nối mạng rồi bấm Nộp bài lại.");
      return false;
    }
  }

  if (view.kind === "playing") {
    return (
      <QuizPlayer
        key={view.paper.attemptId ?? "preview"}
        title={lesson.title}
        paper={view.paper}
        preview={preview}
        onSubmit={(answers) => submit(view.paper, answers)}
      />
    );
  }

  if (view.kind === "result") {
    const canRetry = preview || (!!overview && !overview.passed && overview.remaining !== 0);
    return (
      <QuizResultView
        title={lesson.title}
        result={view.result}
        preview={preview}
        canRetry={canRetry}
        nextHref={!preview && view.result.passed ? nextHref : null}
        retrying={starting}
        onRetry={start}
        onBack={() => setView({ kind: "intro" })}
      />
    );
  }

  return (
    <QuizIntro
      lesson={lesson}
      overview={overview}
      preview={preview}
      pending={starting}
      onStart={start}
      onViewResult={viewResult}
    />
  );
}
