import type { LessonDetail } from "@/lib/learning";
import { DocumentLesson } from "./document-lesson";
import { QuizLesson } from "./quiz-lesson";
import { VideoLesson } from "./video-lesson";

/** Chọn giao diện theo loại bài (dùng chung cho trang học và tab Xem trước). Nằm trong <LessonShell>. */
export function LessonBody({
  lesson,
  videoProgress = { lastPositionSeconds: 0, maxWatchedSeconds: 0 },
}: {
  lesson: LessonDetail;
  videoProgress?: { lastPositionSeconds: number; maxWatchedSeconds: number };
}) {
  if (lesson.type === "VIDEO") return <VideoLesson lesson={lesson} initial={videoProgress} />;
  if (lesson.type === "DOCUMENT") return <DocumentLesson lesson={lesson} />;
  return <QuizLesson lesson={lesson} />;
}
