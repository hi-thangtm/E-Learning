import type { LessonType, VideoProvider, VideoStatus } from "@prisma/client";

/** Dữ liệu tab Nội dung truyền từ page.tsx (server) sang trình soạn (client). */

export type ContentLesson = {
  id: string;
  title: string;
  type: LessonType;
  isArchived: boolean;
  // DOCUMENT
  content: string;
  fileKey: string | null;
  fileName: string | null;
  // VIDEO
  minWatchPercent: number;
  videoProvider: VideoProvider | null;
  videoId: string | null;
  videoStatus: VideoStatus | null;
  durationSeconds: number | null;
  // QUIZ
  questionTopic: string;
  questionCount: number | null;
  passingScore: number | null;
  timeLimitMinutes: number | null;
  maxAttempts: number | null;
  showAnswers: boolean;
};

export type ContentSection = {
  id: string;
  title: string;
  isArchived: boolean;
  lessons: ContentLesson[];
};

/** Thứ tự gửi lên server khi kéo thả: chương theo thứ tự, mỗi chương là danh sách id bài theo thứ tự. */
export type ContentLayout = { sectionId: string; lessonIds: string[] }[];
