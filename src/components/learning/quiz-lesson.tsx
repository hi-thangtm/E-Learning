import { Clock, ListChecks, Repeat, Target } from "lucide-react";
import type { LessonDetail } from "@/lib/learning";

type QuizDetail = Extract<LessonDetail, { type: "QUIZ" }>;

/** Bài KIỂM TRA — chỉ hiện thông tin; làm bài có ở Việc 17 (chưa đánh dấu xong được). */
export function QuizLesson({ lesson }: { lesson: QuizDetail }) {
  const items = [
    { icon: ListChecks, label: "Số câu hỏi", value: lesson.questionCount ? `${lesson.questionCount} câu` : "—" },
    { icon: Target, label: "Điểm đạt", value: lesson.passingScore != null ? `${lesson.passingScore}/100` : "—" },
    { icon: Clock, label: "Thời gian", value: lesson.timeLimitMinutes ? `${lesson.timeLimitMinutes} phút` : "Không giới hạn" },
    { icon: Repeat, label: "Số lần làm", value: lesson.maxAttempts ? `Tối đa ${lesson.maxAttempts} lần` : "Không giới hạn" },
  ];
  return (
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
      <dl className="mt-6 grid grid-cols-4 gap-4">
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
      <p className="mt-6 rounded-md bg-info/16 px-4 py-3 text-[15px] text-info">Bài kiểm tra có ở Việc 17.</p>
    </section>
  );
}
