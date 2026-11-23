import "server-only";
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  OPTION_LETTERS,
  QUESTION_LIMITS,
  QUESTION_TYPE_LABELS,
  type QuestionOption,
  type TopicStats,
} from "@/lib/question-labels";
import { formatNumber } from "@/lib/format";

/**
 * Ngân hàng câu hỏi — phần chạy ở server (docs/database.md — mục "Ngân hàng câu hỏi").
 * Dùng chung cho: form thêm / sửa, import Excel, dialog bài kiểm tra, kiểm tra trước khi phát hành (Việc 21).
 */

/** Câu "đang dùng" = được rút vào đề. */
export const ACTIVE_QUESTION_WHERE = { isActive: true, isApproved: true } satisfies Prisma.QuestionWhereInput;

// ---------------------------------------------------------------------------------------------
// Kiểm tra dữ liệu câu hỏi (form + import)

/** So sánh phương án trùng: bỏ khoảng trắng thừa, không phân biệt hoa / thường. */
export function normalizeQuestionText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase("vi");
}

const optionSchema = z.object({
  id: z.string().trim().max(20).optional(),
  text: z.string().trim().max(QUESTION_LIMITS.option, `Mỗi phương án tối đa ${QUESTION_LIMITS.option} ký tự.`),
  isCorrect: z.boolean(),
});

export const questionInputSchema = z
  .object({
    content: z
      .string()
      .trim()
      .min(1, "Vui lòng nhập nội dung câu hỏi.")
      .max(QUESTION_LIMITS.content, `Nội dung tối đa ${formatNumber(QUESTION_LIMITS.content)} ký tự.`),
    topic: z
      .string()
      .trim()
      .max(QUESTION_LIMITS.topic, `Chủ đề tối đa ${QUESTION_LIMITS.topic} ký tự.`)
      .transform((v) => (v === "" ? null : v.replace(/\s+/g, " "))),
    type: z.enum(["SINGLE", "MULTIPLE"], { message: "Vui lòng chọn loại câu hỏi." }),
    options: z.array(optionSchema),
    explanation: z
      .string()
      .trim()
      .max(QUESTION_LIMITS.explanation, `Giải thích tối đa ${formatNumber(QUESTION_LIMITS.explanation)} ký tự.`)
      .transform((v) => (v === "" ? null : v)),
  })
  .superRefine((q, ctx) => {
    const issue = (message: string) => ctx.addIssue({ code: "custom", path: ["options"], message });
    const { minOptions, maxOptions } = QUESTION_LIMITS;

    if (q.options.length < minOptions || q.options.length > maxOptions) {
      issue(`Câu hỏi phải có từ ${minOptions} đến ${maxOptions} phương án.`);
      return;
    }
    const emptyIndex = q.options.findIndex((o) => o.text === "");
    if (emptyIndex >= 0) {
      issue(`Phương án ${OPTION_LETTERS[emptyIndex]} đang để trống.`);
      return;
    }
    const seen = new Map<string, number>();
    for (const [i, o] of q.options.entries()) {
      const key = normalizeQuestionText(o.text);
      const first = seen.get(key);
      if (first !== undefined) {
        issue(`Phương án ${OPTION_LETTERS[i]} trùng với phương án ${OPTION_LETTERS[first]}.`);
        return;
      }
      seen.set(key, i);
    }
    const correct = q.options.filter((o) => o.isCorrect).length;
    if (q.type === "SINGLE" && correct !== 1) {
      issue(
        correct === 0
          ? "Hãy chọn 1 đáp án đúng."
          : `Loại “${QUESTION_TYPE_LABELS.SINGLE}” chỉ được có đúng 1 đáp án đúng (đang chọn ${correct}).`,
      );
    }
    if (q.type === "MULTIPLE" && correct < 1) issue("Hãy chọn ít nhất 1 đáp án đúng.");
  });

export type QuestionInput = z.infer<typeof questionInputSchema>;

/** Id phương án mới: 8 ký tự a-z0-9. */
function newOptionId(): string {
  return randomBytes(6).toString("base64url").replace(/[^a-zA-Z0-9]/g, "x").slice(0, 8).toLowerCase();
}

/**
 * Gắn id cho phương án: giữ id cũ nếu trình duyệt gửi đúng id đang có của câu hỏi (sửa nội dung không đổi id),
 * phương án mới / id lạ → id mới. Không đánh lại thứ tự.
 */
export function assignOptionIds(options: QuestionInput["options"], existing: QuestionOption[] = []): QuestionOption[] {
  const known = new Set(existing.map((o) => o.id));
  const used = new Set<string>();
  return options.map((o) => {
    let id = o.id && known.has(o.id) && !used.has(o.id) ? o.id : newOptionId();
    while (used.has(id)) id = newOptionId();
    used.add(id);
    return { id, text: o.text, isCorrect: o.isCorrect };
  });
}

/** Đọc cột `options` (JSON) an toàn. */
export function parseOptions(value: Prisma.JsonValue): QuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const o = item as Record<string, unknown>;
    if (typeof o.id !== "string" || typeof o.text !== "string") return [];
    return [{ id: o.id, text: o.text, isCorrect: o.isCorrect === true }];
  });
}

/** 80 ký tự đầu nội dung — dùng cho nhật ký (không ghi đáp án). */
export function contentPreview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

// ---------------------------------------------------------------------------------------------
// Thống kê + kiểm tra bài kiểm tra

/** Số câu đang dùng theo chủ đề (sắp theo tên, "Không có chủ đề" cuối). */
export async function getTopicStats(courseId: string): Promise<TopicStats> {
  const groups = await prisma.question.groupBy({
    by: ["topic"],
    where: { courseId, ...ACTIVE_QUESTION_WHERE },
    _count: { _all: true },
  });
  const topics = groups
    .map((g) => ({ topic: g.topic, count: g._count._all }))
    .sort((a, b) => (a.topic === null ? 1 : b.topic === null ? -1 : a.topic.localeCompare(b.topic, "vi")));
  return { total: topics.reduce((sum, t) => sum + t.count, 0), topics };
}

/** Số câu đang dùng phù hợp chủ đề (null = toàn bộ ngân hàng). */
export function matchingCount(stats: TopicStats, topic: string | null): number {
  if (!topic) return stats.total;
  return stats.topics.find((t) => t.topic === topic)?.count ?? 0;
}

/**
 * Lỗi của các bài kiểm tra đang dùng trong khoá — gọi trước khi phát hành (Việc 21) và hiện cảnh báo ở trang soạn.
 * Bài kiểm tra hợp lệ khi có số câu, điểm đạt và ngân hàng đủ câu đang dùng phù hợp chủ đề.
 */
export async function getQuizBankIssues(courseId: string, stats?: TopicStats): Promise<string[]> {
  const [quizzes, bank] = await Promise.all([
    prisma.lesson.findMany({
      where: { type: "QUIZ", isArchived: false, section: { courseId, isArchived: false } },
      orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      select: { title: true, questionTopic: true, questionCount: true, passingScore: true },
    }),
    stats ? Promise.resolve(stats) : getTopicStats(courseId),
  ]);

  const issues: string[] = [];
  for (const quiz of quizzes) {
    const missing = [quiz.questionCount === null && "số câu rút", quiz.passingScore === null && "điểm đạt"].filter(Boolean);
    if (missing.length > 0) {
      issues.push(`Bài ${quiz.title}: chưa đặt ${missing.join(" và ")}.`);
      continue;
    }
    const available = matchingCount(bank, quiz.questionTopic);
    if (available < quiz.questionCount!) {
      const topic = quiz.questionTopic ? `chủ đề “${quiz.questionTopic}”` : "(tất cả chủ đề)";
      issues.push(`Bài ${quiz.title}: cần ${quiz.questionCount} câu ${topic}, ngân hàng có ${available} câu đang dùng.`);
    }
  }
  return issues;
}
