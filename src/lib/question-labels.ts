import type { QuestionType } from "@prisma/client";

/**
 * Nhãn + giới hạn của ngân hàng câu hỏi — dùng được cả server lẫn trình duyệt (chỉ `import type` từ Prisma).
 * Quy tắc nghiệp vụ: docs/database.md — mục "Ngân hàng câu hỏi".
 */

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  SINGLE: "Một đáp án",
  MULTIPLE: "Nhiều đáp án",
};

/** Nhãn phương án theo thứ tự (cũng là cột Phương án A–F trong file Excel). */
export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

export const QUESTION_LIMITS = {
  minOptions: 2,
  maxOptions: 6,
  content: 2000,
  option: 500,
  topic: 100,
  explanation: 2000,
} as const;

/** Một phương án lưu trong cột `questions.options` (JSON). `id` ổn định khi sửa câu hỏi. */
export type QuestionOption = { id: string; text: string; isCorrect: boolean };

/** Giá trị `?topic=` cho câu không có chủ đề. */
export const NO_TOPIC = "__none__";

/** Chủ đề hiển thị (null -> "Không có chủ đề"). */
export function topicLabel(topic: string | null | undefined): string {
  return topic ? topic : "Không có chủ đề";
}

/** Thống kê câu đang dùng theo chủ đề (truyền từ server sang trình duyệt). */
export type TopicStats = { total: number; topics: { topic: string | null; count: number }[] };
