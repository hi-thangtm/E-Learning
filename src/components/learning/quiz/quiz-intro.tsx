"use client";

import { CheckCircle2, Clock, ListChecks, Loader2, Play, Repeat, Target, Trophy, TriangleAlert } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { LessonDetail } from "@/lib/learning";
import type { QuizOverview } from "@/lib/quiz";

type QuizDetail = Extract<LessonDetail, { type: "QUIZ" }>;

/** Màn hình trước khi làm: thông số bài, lượt còn lại, điểm cao nhất, lịch sử các lần làm. */
export function QuizIntro({
  lesson,
  overview,
  preview,
  pending,
  onStart,
  onViewResult,
}: {
  lesson: QuizDetail;
  overview: QuizOverview | null;
  preview: boolean;
  pending: boolean;
  onStart: () => void;
  onViewResult: (attemptId: string) => void;
}) {
  const remainingText =
    overview === null
      ? lesson.maxAttempts
        ? `Tối đa ${lesson.maxAttempts} lần`
        : "Không giới hạn"
      : overview.max === null
        ? "Không giới hạn"
        : `${overview.remaining}/${overview.max} lần`;

  const items = [
    { icon: ListChecks, label: "Số câu hỏi", value: lesson.questionCount ? `${lesson.questionCount} câu` : "—" },
    { icon: Clock, label: "Thời gian", value: lesson.timeLimitMinutes ? `${lesson.timeLimitMinutes} phút` : "Không giới hạn" },
    { icon: Target, label: "Điểm đạt", value: lesson.passingScore != null ? `${lesson.passingScore}/100` : "—" },
    { icon: Repeat, label: preview ? "Số lần làm" : "Lượt còn lại", value: remainingText },
    ...(overview ? [{ icon: Trophy, label: "Điểm cao nhất", value: overview.bestScore != null ? `${overview.bestScore}/100` : "Chưa có" }] : []),
  ];

  const outOfAttempts = !!overview && !overview.passed && overview.remaining === 0 && !overview.inProgress;
  const canStart = preview || (!!overview && overview.ready && !overview.passed && !outOfAttempts);

  return (
    <div className="space-y-6">
      <section className="rounded-md bg-card p-8 shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex size-12 items-center justify-center rounded-md bg-primary/16 text-primary">
            <ListChecks className="size-6" />
          </span>
          <div>
            <p className="text-[13px] text-muted-foreground">Bài kiểm tra</p>
            <h2 className="text-xl font-medium text-foreground">{lesson.title}</h2>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-5 gap-4">
          {items.map(({ icon: Icon, label, value }) => (
            <div key={label} className="rounded-md border border-border p-4">
              <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
                <Icon className="size-4" />
                {label}
              </dt>
              <dd className="mt-1 font-medium text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-6 flex flex-wrap items-center gap-4">
          {overview?.passed ? (
            <p className="flex items-center gap-2 rounded-md bg-success/16 px-4 py-3 text-[15px] text-success">
              <CheckCircle2 className="size-5" />
              Bạn đã đạt bài kiểm tra này
              {overview.bestScore != null && ` với ${overview.bestScore} điểm`}.
            </p>
          ) : outOfAttempts ? (
            <p className="flex items-center gap-2 rounded-md bg-destructive/16 px-4 py-3 text-[15px] text-destructive">
              <TriangleAlert className="size-5" />
              Bạn đã hết lượt làm bài. Liên hệ quản trị đào tạo để được cấp thêm lượt.
            </p>
          ) : overview && !overview.ready ? (
            <p className="flex items-center gap-2 rounded-md bg-warning/16 px-4 py-3 text-[15px] text-warning">
              <TriangleAlert className="size-5" />
              {overview.notReadyReason}
            </p>
          ) : null}

          {canStart && (
            <Button size="lg" onClick={onStart} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Play />}
              {preview ? "Làm thử" : overview?.inProgress ? "Làm tiếp" : "Bắt đầu làm bài"}
            </Button>
          )}
          {!preview && overview?.inProgress?.deadline && (
            <p className="text-[13px] text-muted-foreground">
              Lượt đang làm dở — hết giờ lúc {formatDateTime(overview.inProgress.deadline)}.
            </p>
          )}
          {preview && (
            <p className="text-[13px] text-muted-foreground">
              Xem trước: đề rút ngẫu nhiên như học viên, không lưu kết quả và luôn hiện đáp án sau khi nộp.
            </p>
          )}
        </div>
      </section>

      {overview && overview.history.length > 0 && (
        <section className="overflow-hidden rounded-md bg-card shadow-sm">
          <h3 className="px-6 pt-5 pb-3 text-lg font-medium text-foreground">Lịch sử làm bài</h3>
          <table className="w-full">
            <thead>
              <tr className="border-y border-border">
                {["Lần", "Bắt đầu", "Nộp lúc", "Điểm", "Kết quả", ""].map((h, i) => (
                  <th
                    key={i}
                    scope="col"
                    className="h-12 px-4 text-left text-[13px] font-medium tracking-[0.2px] text-foreground uppercase first:pl-6 last:pr-6"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.history.map((a) => (
                <tr key={a.id} className="border-b border-border text-[15px] last:border-0">
                  <td className="h-[50px] pr-4 pl-6 text-foreground">{a.attemptNo}</td>
                  <td className="px-4 text-muted-foreground">{formatDateTime(a.startedAt)}</td>
                  <td className="px-4 text-muted-foreground">{a.submittedAt ? formatDateTime(a.submittedAt) : "—"}</td>
                  <td className="px-4 font-medium text-foreground tabular-nums">{a.score ?? "—"}</td>
                  <td className="px-4">
                    {a.submittedAt === null ? (
                      <StatusBadge tone="primary">Đang làm</StatusBadge>
                    ) : a.passed ? (
                      <StatusBadge tone="success">Đạt</StatusBadge>
                    ) : (
                      <StatusBadge tone="destructive">Không đạt</StatusBadge>
                    )}
                  </td>
                  <td className="pr-6 pl-4 text-right">
                    {a.submittedAt && (
                      <Button variant="ghost" size="sm" onClick={() => onViewResult(a.id)} disabled={pending}>
                        Xem lại
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
