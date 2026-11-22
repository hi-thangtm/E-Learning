import "server-only";
import { randomInt } from "node:crypto";
import { Prisma, type QuestionType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { completeLesson, getCourseIdOfLesson, getLessonAccess, type LessonCompletion } from "@/lib/learning";
import { ACTIVE_QUESTION_WHERE, parseOptions } from "@/lib/question-bank";

/**
 * Bài kiểm tra phía học viên (Việc 17) — CHỈ chạy ở server. docs/database.md — Quy tắc 4.
 *
 * - Đề rút ngẫu nhiên từ ngân hàng câu hỏi của khoá, xáo thứ tự câu + phương án, lưu NGUYÊN snapshot (kể cả đáp án,
 *   giải thích) vào quiz_attempts.answers để chấm và xem lại dù câu hỏi bị sửa sau này.
 * - Trình duyệt chỉ nhận đề KHÔNG có isCorrect / explanation (toPaper). Đáp án chỉ trả về sau khi nộp và lesson.showAnswers = true.
 * - Số lượt tối đa = maxAttempts + bonusAttempts (maxAttempts NULL = không giới hạn), đếm trong courseVersion hiện tại.
 * - Không ghi audit_logs cho việc làm bài.
 */

/** Ân hạn sau deadline cho lần lưu / nộp cuối (mạng chậm). */
export const QUIZ_GRACE_SECONDS = 30;

// ---------------------------------------------------------------------------------------------
// Kiểu dữ liệu

type SnapshotOption = { id: string; text: string; isCorrect: boolean };
type SnapshotQuestion = {
  questionId: string;
  type: QuestionType;
  content: string;
  imageUrl: string | null;
  options: SnapshotOption[];
  explanation: string | null;
  selected: string[];
};

/** Câu hỏi gửi trình duyệt khi đang làm — KHÔNG có đáp án, KHÔNG có giải thích. */
export type PaperQuestion = {
  id: string;
  type: QuestionType;
  content: string;
  imageKey: string | null;
  options: { id: string; text: string }[];
  selected: string[];
};

export type QuizPaper = {
  attemptId: string | null; // null = xem trước (không lưu)
  attemptNo: number;
  /** ISO; null = không giới hạn thời gian */
  deadline: string | null;
  /** Giờ server lúc trả đề — để trình duyệt bù lệch đồng hồ */
  serverNow: string;
  questions: PaperQuestion[];
};

export type QuizHistoryItem = {
  id: string;
  attemptNo: number;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  passed: boolean | null;
};

export type QuizOverview = {
  lessonId: string;
  questionCount: number | null;
  passingScore: number | null;
  timeLimitMinutes: number | null;
  showAnswers: boolean;
  /** Bài đã cấu hình đủ và ngân hàng đủ câu để làm */
  ready: boolean;
  notReadyReason: string | null;
  used: number;
  /** null = không giới hạn */
  max: number | null;
  remaining: number | null;
  bestScore: number | null;
  passed: boolean;
  inProgress: { attemptId: string; deadline: string | null } | null;
  history: QuizHistoryItem[];
};

export type ResultDetail = {
  questionId: string;
  type: QuestionType;
  content: string;
  imageKey: string | null;
  explanation: string | null;
  isCorrect: boolean;
  options: { id: string; text: string; isCorrect: boolean; selected: boolean }[];
};

export type QuizResult = {
  attemptId: string | null;
  attemptNo: number;
  score: number;
  passed: boolean;
  correct: number;
  total: number;
  passingScore: number;
  /** Chỉ có khi bài cho xem đáp án (hoặc chế độ xem trước) */
  details: ResultDetail[] | null;
};

export type QuizActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ---------------------------------------------------------------------------------------------
// Tiện ích

const QUIZ_LESSON_SELECT = {
  id: true,
  title: true,
  type: true,
  questionTopic: true,
  questionCount: true,
  passingScore: true,
  timeLimitMinutes: true,
  maxAttempts: true,
  showAnswers: true,
  section: { select: { courseId: true, course: { select: { currentVersion: true } } } },
} as const;

type QuizLesson = Prisma.LessonGetPayload<{ select: typeof QUIZ_LESSON_SELECT }>;

function loadQuizLesson(lessonId: string) {
  return prisma.lesson.findUnique({ where: { id: lessonId }, select: QUIZ_LESSON_SELECT });
}

/** Xáo trộn Fisher–Yates bằng số ngẫu nhiên mật mã (không đoán được thứ tự). */
function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseSnapshot(value: Prisma.JsonValue): SnapshotQuestion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const q = item as Record<string, unknown>;
    if (typeof q.questionId !== "string" || typeof q.content !== "string") return [];
    return [
      {
        questionId: q.questionId,
        type: q.type === "MULTIPLE" ? "MULTIPLE" : "SINGLE",
        content: q.content,
        imageUrl: typeof q.imageUrl === "string" ? q.imageUrl : null,
        options: parseOptions(q.options as Prisma.JsonValue),
        explanation: typeof q.explanation === "string" ? q.explanation : null,
        selected: Array.isArray(q.selected) ? q.selected.filter((s): s is string => typeof s === "string") : [],
      },
    ];
  });
}

/** Chỉ chọn các trường được phép gửi trình duyệt (không isCorrect, không explanation). */
function toPaperQuestion(q: SnapshotQuestion): PaperQuestion {
  return {
    id: q.questionId,
    type: q.type,
    content: q.content,
    imageKey: q.imageUrl,
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
    selected: q.selected,
  };
}

function deadlineOf(startedAt: Date, timeLimitMinutes: number | null): Date | null {
  return timeLimitMinutes ? new Date(startedAt.getTime() + timeLimitMinutes * 60_000) : null;
}

/** Quá hạn hẳn (đã qua cả ân hạn) → không nhận lưu nữa, phải chấm. */
function isExpired(deadline: Date | null, now = new Date()): boolean {
  return !!deadline && now.getTime() > deadline.getTime() + QUIZ_GRACE_SECONDS * 1000;
}

/** Chấm theo snapshot. Một đáp án: chọn đúng 1 phương án đúng. Nhiều đáp án: tập chọn TRÙNG KHỚP tập đúng (không điểm từng phần). */
export function gradeSnapshot(snapshot: SnapshotQuestion[], passingScore: number) {
  const perQuestion = snapshot.map((q) => {
    const correctIds = q.options.filter((o) => o.isCorrect).map((o) => o.id);
    const chosen = new Set(q.selected);
    const isCorrect = chosen.size === correctIds.length && correctIds.every((id) => chosen.has(id));
    return { q, isCorrect };
  });
  const correct = perQuestion.filter((p) => p.isCorrect).length;
  const total = snapshot.length;
  const score = total ? Math.round((correct / total) * 100) : 0;
  return { perQuestion, correct, total, score, passed: score >= passingScore };
}

function toDetails(perQuestion: ReturnType<typeof gradeSnapshot>["perQuestion"]): ResultDetail[] {
  return perQuestion.map(({ q, isCorrect }) => ({
    questionId: q.questionId,
    type: q.type,
    content: q.content,
    imageKey: q.imageUrl,
    explanation: q.explanation,
    isCorrect,
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect, selected: q.selected.includes(o.id) })),
  }));
}

/** Bài đủ điều kiện để làm: cấu hình đủ + ngân hàng đủ câu đang dùng. */
async function readiness(lesson: QuizLesson): Promise<string | null> {
  if (!lesson.questionCount || lesson.passingScore === null) {
    return "Bài kiểm tra chưa được cấu hình đầy đủ. Vui lòng liên hệ quản trị đào tạo.";
  }
  const available = await prisma.question.count({ where: bankWhere(lesson) });
  if (available < lesson.questionCount) {
    return "Bài kiểm tra chưa đủ câu hỏi. Vui lòng liên hệ quản trị đào tạo.";
  }
  return null;
}

function bankWhere(lesson: QuizLesson): Prisma.QuestionWhereInput {
  return {
    courseId: lesson.section.courseId,
    ...ACTIVE_QUESTION_WHERE,
    ...(lesson.questionTopic && { topic: lesson.questionTopic }),
  };
}

/** Rút đề: chọn ngẫu nhiên questionCount câu, xáo thứ tự câu và phương án. */
async function drawQuestions(lesson: QuizLesson): Promise<SnapshotQuestion[]> {
  const pool = await prisma.question.findMany({
    where: bankWhere(lesson),
    select: { id: true, type: true, content: true, imageUrl: true, options: true, explanation: true },
  });
  return shuffle(pool)
    .slice(0, lesson.questionCount ?? 0)
    .map((q) => ({
      questionId: q.id,
      type: q.type,
      content: q.content,
      imageUrl: q.imageUrl,
      options: shuffle(parseOptions(q.options)),
      explanation: q.explanation,
      selected: [],
    }));
}

/** Kiểm tra quyền học viên với bài kiểm tra (có lượt học, bài chưa khoá / ẩn, đúng loại). */
async function learnerQuizAccess(userId: string, lessonId: string) {
  const courseId = await getCourseIdOfLesson(lessonId);
  if (!courseId) return null;
  const access = await getLessonAccess(userId, courseId, lessonId);
  if (!access.ok || access.lesson.type !== "QUIZ") return null;
  const lesson = await loadQuizLesson(lessonId);
  return lesson ? { lesson, access } : null;
}

async function attemptLimit(userId: string, lesson: QuizLesson) {
  const version = lesson.section.course.currentVersion;
  const [used, progress] = await Promise.all([
    prisma.quizAttempt.count({ where: { userId, lessonId: lesson.id, courseVersion: version } }),
    prisma.lessonProgress.findUnique({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      select: { bonusAttempts: true },
    }),
  ]);
  const max = lesson.maxAttempts === null ? null : lesson.maxAttempts + (progress?.bonusAttempts ?? 0);
  return { used, max, remaining: max === null ? null : Math.max(0, max - used), version };
}

// ---------------------------------------------------------------------------------------------
// Tổng quan

export async function getQuizOverview(userId: string, lessonId: string): Promise<QuizOverview | null> {
  const lesson = await loadQuizLesson(lessonId);
  if (!lesson || lesson.type !== "QUIZ") return null;

  const limit = await attemptLimit(userId, lesson);
  const attempts = await prisma.quizAttempt.findMany({
    where: { userId, lessonId, courseVersion: limit.version },
    orderBy: { attemptNo: "desc" },
    select: { id: true, attemptNo: true, startedAt: true, submittedAt: true, score: true, passed: true },
  });
  const open = attempts.find((a) => !a.submittedAt);
  const scores = attempts.flatMap((a) => (a.score === null ? [] : [a.score]));
  const notReadyReason = await readiness(lesson);

  return {
    lessonId,
    questionCount: lesson.questionCount,
    passingScore: lesson.passingScore,
    timeLimitMinutes: lesson.timeLimitMinutes,
    showAnswers: lesson.showAnswers,
    ready: !notReadyReason,
    notReadyReason,
    used: limit.used,
    max: limit.max,
    remaining: limit.remaining,
    bestScore: scores.length ? Math.max(...scores) : null,
    passed: attempts.some((a) => a.passed === true),
    inProgress: open
      ? { attemptId: open.id, deadline: deadlineOf(open.startedAt, lesson.timeLimitMinutes)?.toISOString() ?? null }
      : null,
    history: attempts.map((a) => ({
      id: a.id,
      attemptNo: a.attemptNo,
      startedAt: a.startedAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null,
      score: a.score,
      passed: a.passed,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Bắt đầu / làm tiếp

function paperFrom(
  attempt: { id: string; attemptNo: number; startedAt: Date; answers: Prisma.JsonValue },
  lesson: QuizLesson,
): QuizPaper {
  return {
    attemptId: attempt.id,
    attemptNo: attempt.attemptNo,
    deadline: deadlineOf(attempt.startedAt, lesson.timeLimitMinutes)?.toISOString() ?? null,
    serverNow: new Date().toISOString(),
    questions: parseSnapshot(attempt.answers).map(toPaperQuestion),
  };
}

const ATTEMPT_SELECT = { id: true, attemptNo: true, startedAt: true, answers: true, submittedAt: true } as const;

export async function startAttempt(userId: string, lessonId: string): Promise<QuizActionResult<QuizPaper>> {
  const ctx = await learnerQuizAccess(userId, lessonId);
  if (!ctx) return { ok: false, error: "Bạn chưa được làm bài kiểm tra này." };
  const { lesson } = ctx;

  // Lượt dở đã quá hạn → chấm trước
  await autoSubmitExpired(userId, lessonId);

  const limit = await attemptLimit(userId, lesson);
  const open = await prisma.quizAttempt.findFirst({
    where: { userId, lessonId, courseVersion: limit.version, submittedAt: null },
    select: ATTEMPT_SELECT,
  });
  if (open) return { ok: true, data: paperFrom(open, lesson) };

  const passed = await prisma.quizAttempt.findFirst({
    where: { userId, lessonId, courseVersion: limit.version, passed: true },
    select: { id: true },
  });
  if (passed) return { ok: false, error: "Bạn đã đạt bài kiểm tra này." };
  if (limit.remaining === 0) {
    return { ok: false, error: "Bạn đã hết lượt làm bài. Liên hệ quản trị đào tạo để được cấp thêm lượt." };
  }

  const notReady = await readiness(lesson);
  if (notReady) return { ok: false, error: notReady };

  const snapshot = await drawQuestions(lesson);
  try {
    const attempt = await prisma.quizAttempt.create({
      data: {
        lessonId,
        userId,
        courseVersion: limit.version,
        attemptNo: limit.used + 1,
        answers: snapshot as unknown as Prisma.InputJsonValue,
      },
      select: ATTEMPT_SELECT,
    });
    return { ok: true, data: paperFrom(attempt, lesson) };
  } catch (error) {
    // Bấm "Bắt đầu" 2 lần cùng lúc: lượt kia đã tạo → trả lại lượt đó
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const again = await prisma.quizAttempt.findFirst({
        where: { userId, lessonId, courseVersion: limit.version, submittedAt: null },
        select: ATTEMPT_SELECT,
      });
      if (again) return { ok: true, data: paperFrom(again, lesson) };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Lưu câu trả lời

export async function saveAnswer(
  userId: string,
  attemptId: string,
  questionId: string,
  selected: string[],
): Promise<QuizActionResult<{ savedAt: string }>> {
  return prisma.$transaction(async (tx) => {
    // Khoá dòng: các lần lưu liên tiếp của cùng lượt chạy lần lượt, không ghi đè nhau
    await tx.$queryRaw`SELECT id FROM quiz_attempts WHERE id = ${attemptId} FOR UPDATE`;
    const attempt = await tx.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        userId: true,
        startedAt: true,
        submittedAt: true,
        answers: true,
        lesson: { select: { timeLimitMinutes: true } },
      },
    });
    if (!attempt || attempt.userId !== userId) return { ok: false as const, error: "Không tìm thấy lượt làm bài." };
    if (attempt.submittedAt) return { ok: false as const, error: "Bài đã nộp, không sửa được câu trả lời." };
    if (isExpired(deadlineOf(attempt.startedAt, attempt.lesson.timeLimitMinutes))) {
      return { ok: false as const, error: "Đã hết giờ làm bài." };
    }

    const snapshot = parseSnapshot(attempt.answers);
    const question = snapshot.find((q) => q.questionId === questionId);
    if (!question) return { ok: false as const, error: "Câu hỏi không thuộc đề này." };

    const valid = new Set(question.options.map((o) => o.id));
    const clean = [...new Set(selected)].filter((id) => valid.has(id));
    if (clean.length !== new Set(selected).size) return { ok: false as const, error: "Phương án không hợp lệ." };
    if (question.type === "SINGLE" && clean.length > 1) return { ok: false as const, error: "Câu này chỉ chọn 1 đáp án." };

    question.selected = clean;
    await tx.quizAttempt.update({
      where: { id: attemptId },
      data: { answers: snapshot as unknown as Prisma.InputJsonValue },
    });
    return { ok: true as const, data: { savedAt: new Date().toISOString() } };
  });
}

// ---------------------------------------------------------------------------------------------
// Nộp bài + kết quả

export type SubmitOutcome = { result: QuizResult; completion: LessonCompletion | null; overview: QuizOverview | null };

/**
 * Chấm 1 lượt (chỉ khi chưa nộp — cập nhật có điều kiện để không chấm 2 lần). Đạt → hoàn thành bài.
 * Dùng chung: nộp bài, mở trang bài kiểm tra, tác vụ hằng ngày (src/lib/jobs/daily.ts). null = không chấm (đã nộp / không có).
 */
export async function gradeAttempt(attemptId: string): Promise<{ completion: LessonCompletion | null } | null> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, lessonId: true, answers: true, submittedAt: true, lesson: { select: { passingScore: true } } },
  });
  if (!attempt || attempt.submittedAt) return null;
  const graded = gradeSnapshot(parseSnapshot(attempt.answers), attempt.lesson.passingScore ?? 100);
  const updated = await prisma.quizAttempt.updateMany({
    where: { id: attemptId, submittedAt: null },
    data: { score: graded.score, passed: graded.passed, submittedAt: new Date() },
  });
  if (updated.count === 0) return null;

  let completion: LessonCompletion | null = null;
  if (graded.passed) {
    // Còn lượt học (khác CANCELLED) mới đánh dấu xong bài
    const courseId = await getCourseIdOfLesson(attempt.lessonId);
    const enrollment = courseId
      ? await prisma.enrollment.findFirst({
          where: { userId: attempt.userId, courseId, status: { not: "CANCELLED" } },
          select: { id: true },
        })
      : null;
    if (enrollment) completion = await completeLesson(attempt.userId, attempt.lessonId);
  }
  return { completion };
}

export async function submitAttempt(userId: string, attemptId: string): Promise<QuizActionResult<SubmitOutcome>> {
  const attempt = await prisma.quizAttempt.findUnique({ where: { id: attemptId }, select: { userId: true, lessonId: true } });
  if (!attempt || attempt.userId !== userId) return { ok: false, error: "Không tìm thấy lượt làm bài." };

  const graded = await gradeAttempt(attemptId);
  const result = await getAttemptResult(userId, attemptId);
  if (!result.ok) return result;
  return {
    ok: true,
    data: { result: result.data, completion: graded?.completion ?? null, overview: await getQuizOverview(userId, attempt.lessonId) },
  };
}

/** Chấm mọi lượt dở đã quá hạn của người học ở bài này (gọi mỗi khi mở trang bài kiểm tra). */
export async function autoSubmitExpired(userId: string, lessonId: string): Promise<void> {
  const open = await prisma.quizAttempt.findMany({
    where: { userId, lessonId, submittedAt: null },
    select: { id: true, startedAt: true, lesson: { select: { timeLimitMinutes: true } } },
  });
  for (const a of open) {
    if (isExpired(deadlineOf(a.startedAt, a.lesson.timeLimitMinutes))) await gradeAttempt(a.id);
  }
}

export async function getAttemptResult(userId: string, attemptId: string): Promise<QuizActionResult<QuizResult>> {
  const attempt = await prisma.quizAttempt.findUnique({
    where: { id: attemptId },
    select: {
      userId: true,
      attemptNo: true,
      answers: true,
      submittedAt: true,
      score: true,
      passed: true,
      lesson: { select: { passingScore: true, showAnswers: true } },
    },
  });
  if (!attempt || attempt.userId !== userId) return { ok: false, error: "Không tìm thấy lượt làm bài." };
  if (!attempt.submittedAt) return { ok: false, error: "Bài chưa nộp." };

  const passingScore = attempt.lesson.passingScore ?? 100;
  const graded = gradeSnapshot(parseSnapshot(attempt.answers), passingScore);
  return {
    ok: true,
    data: {
      attemptId,
      attemptNo: attempt.attemptNo,
      score: attempt.score ?? graded.score,
      passed: attempt.passed ?? graded.passed,
      correct: graded.correct,
      total: graded.total,
      passingScore,
      // Đáp án + giải thích chỉ trả về khi bài cho xem đáp án
      details: attempt.lesson.showAnswers ? toDetails(graded.perQuestion) : null,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Xem trước (người soạn) — không ghi gì vào database

export async function previewPaper(lessonId: string): Promise<QuizActionResult<QuizPaper>> {
  const lesson = await loadQuizLesson(lessonId);
  if (!lesson || lesson.type !== "QUIZ") return { ok: false, error: "Không tìm thấy bài kiểm tra." };
  const notReady = await readiness(lesson);
  if (notReady) return { ok: false, error: notReady.replace("Vui lòng liên hệ quản trị đào tạo.", "Hãy bổ sung trong Ngân hàng câu hỏi.") };
  const snapshot = await drawQuestions(lesson);
  return {
    ok: true,
    data: {
      attemptId: null,
      attemptNo: 0,
      deadline: deadlineOf(new Date(), lesson.timeLimitMinutes)?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      questions: snapshot.map(toPaperQuestion),
    },
  };
}

export async function previewGrade(
  lessonId: string,
  answers: { questionId: string; selected: string[] }[],
): Promise<QuizActionResult<QuizResult>> {
  const lesson = await loadQuizLesson(lessonId);
  if (!lesson || lesson.type !== "QUIZ") return { ok: false, error: "Không tìm thấy bài kiểm tra." };
  // Chỉ chấm câu thuộc đúng khoá của bài
  const questions = await prisma.question.findMany({
    where: { id: { in: answers.map((a) => a.questionId).slice(0, 200) }, courseId: lesson.section.courseId },
    select: { id: true, type: true, content: true, imageUrl: true, options: true, explanation: true },
  });
  const byId = new Map(questions.map((q) => [q.id, q]));
  const snapshot: SnapshotQuestion[] = answers.flatMap((a) => {
    const q = byId.get(a.questionId);
    if (!q) return [];
    return [
      {
        questionId: q.id,
        type: q.type,
        content: q.content,
        imageUrl: q.imageUrl,
        options: parseOptions(q.options),
        explanation: q.explanation,
        selected: a.selected,
      },
    ];
  });
  if (snapshot.length === 0) return { ok: false, error: "Không chấm được bài làm thử." };
  const passingScore = lesson.passingScore ?? 100;
  const graded = gradeSnapshot(snapshot, passingScore);
  return {
    ok: true,
    data: {
      attemptId: null,
      attemptNo: 0,
      score: graded.score,
      passed: graded.passed,
      correct: graded.correct,
      total: graded.total,
      passingScore,
      details: toDetails(graded.perQuestion),
    },
  };
}
