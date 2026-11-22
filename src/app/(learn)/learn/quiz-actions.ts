"use server";

import { z } from "zod";
import { courseVisibleWhere } from "@/lib/course-scope";
import { requireRole, requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  getAttemptResult,
  previewGrade,
  previewPaper,
  saveAnswer,
  startAttempt,
  submitAttempt,
  type QuizActionResult,
  type QuizPaper,
  type QuizResult,
  type SubmitOutcome,
} from "@/lib/quiz";

/**
 * Bài kiểm tra — server actions của trang học (Việc 17). Mọi kiểm tra quyền / hạn giờ / chấm điểm ở src/lib/quiz.ts.
 * Không ghi audit_logs cho việc làm bài.
 */

const id = z.string().min(1).max(50);
const INVALID = { ok: false as const, error: "Dữ liệu không hợp lệ." };

export async function startQuizAction(lessonId: string): Promise<QuizActionResult<QuizPaper>> {
  const user = await requireUser();
  if (!id.safeParse(lessonId).success) return INVALID;
  return startAttempt(user.id, lessonId);
}

const saveSchema = z.object({
  attemptId: id,
  questionId: id,
  selected: z.array(z.string().min(1).max(20)).max(6),
});

export async function saveQuizAnswerAction(
  attemptId: string,
  questionId: string,
  selected: string[],
): Promise<QuizActionResult<{ savedAt: string }>> {
  const user = await requireUser();
  const parsed = saveSchema.safeParse({ attemptId, questionId, selected });
  if (!parsed.success) return INVALID;
  return saveAnswer(user.id, parsed.data.attemptId, parsed.data.questionId, parsed.data.selected);
}

export async function submitQuizAction(attemptId: string): Promise<QuizActionResult<SubmitOutcome>> {
  const user = await requireUser();
  if (!id.safeParse(attemptId).success) return INVALID;
  return submitAttempt(user.id, attemptId);
}

export async function quizResultAction(attemptId: string): Promise<QuizActionResult<QuizResult>> {
  const user = await requireUser();
  if (!id.safeParse(attemptId).success) return INVALID;
  return getAttemptResult(user.id, attemptId);
}

// --- Xem trước (tab Xem trước của trang soạn): người soạn / quản trị thấy được khoá — không lưu gì ---

const EDITOR_ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"] as const;

async function canPreview(lessonId: string): Promise<boolean> {
  const actor = await requireRole([...EDITOR_ROLES]);
  if (!id.safeParse(lessonId).success) return false;
  const lesson = await prisma.lesson.findFirst({
    where: { id: lessonId, type: "QUIZ", section: { course: await courseVisibleWhere(actor) } },
    select: { id: true },
  });
  return !!lesson;
}

export async function previewQuizStartAction(lessonId: string): Promise<QuizActionResult<QuizPaper>> {
  if (!(await canPreview(lessonId))) return { ok: false, error: "Bạn không có quyền xem trước bài này." };
  return previewPaper(lessonId);
}

const previewAnswersSchema = z
  .array(z.object({ questionId: id, selected: z.array(z.string().min(1).max(20)).max(6) }))
  .max(200);

export async function previewQuizSubmitAction(
  lessonId: string,
  answers: { questionId: string; selected: string[] }[],
): Promise<QuizActionResult<QuizResult>> {
  if (!(await canPreview(lessonId))) return { ok: false, error: "Bạn không có quyền xem trước bài này." };
  const parsed = previewAnswersSchema.safeParse(answers);
  if (!parsed.success) return INVALID;
  return previewGrade(lessonId, parsed.data);
}
