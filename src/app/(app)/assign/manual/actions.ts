"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { enrollmentScopeWhere } from "@/lib/assignment-scope";
import { logAudit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { validIsoDate, vnDayEnd, vnIsoDate } from "@/lib/format";

/**
 * Lượt giao khoá: gia hạn, huỷ giao, cấp thêm lượt làm bài kiểm tra (docs/database.md — Quy tắc 3, 4).
 * Phạm vi: Admin công ty chỉ lượt của người công ty mình. Lượt giao tự động mà quy tắc còn chạy thì không huỷ được.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN"] as const;
const NO_ACCESS = "Không tìm thấy lượt giao hoặc bạn không có quyền.";
const idSchema = z.string().trim().min(1).max(50);

async function findEnrollment(enrollmentId: string) {
  const actor = await requireRole([...ROLES]);
  const id = idSchema.safeParse(enrollmentId);
  if (!id.success) return { actor, enrollment: null };
  const enrollment = await prisma.enrollment.findFirst({
    where: { id: id.data, ...enrollmentScopeWhere(actor) },
    select: {
      id: true,
      status: true,
      dueDate: true,
      source: true,
      courseId: true,
      userId: true,
      user: { select: { fullName: true, employeeCode: true, companyId: true } },
      course: { select: { code: true, currentVersion: true } },
      assignmentRule: { select: { isActive: true, name: true } },
    },
  });
  return { actor, enrollment };
}

function revalidate() {
  revalidatePath("/assign/manual");
}

export async function extendEnrollmentAction(enrollmentId: string, newDate: string): Promise<ActionState> {
  const { actor, enrollment } = await findEnrollment(enrollmentId);
  if (!enrollment) return { message: NO_ACCESS };
  if (enrollment.status === "COMPLETED" || enrollment.status === "CANCELLED") {
    return { message: "Chỉ gia hạn được lượt chưa hoàn thành và chưa bị huỷ." };
  }

  const date = String(newDate ?? "");
  // Ngày có thật (2026-02-31 → không hợp lệ) — Việc 29B #14
  if (!validIsoDate(date)) return { errors: { dueDate: "Ngày không hợp lệ." } };
  if (date <= vnIsoDate()) return { errors: { dueDate: "Hạn mới phải sau hôm nay." } };
  if (date > `${new Date().getUTCFullYear() + 5}-12-31`) return { errors: { dueDate: "Hạn quá xa (tối đa 5 năm)." } };
  const dueDate = vnDayEnd(date);

  await prisma.$transaction([
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { dueDate } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: enrollment.user.companyId,
      action: "ENROLLMENT_EXTENDED",
      entityType: "Enrollment",
      entityId: enrollment.id,
      metadata: {
        courseId: enrollment.courseId,
        courseCode: enrollment.course.code,
        learnerName: `${enrollment.user.fullName} (${enrollment.user.employeeCode})`,
        before: { dueDate: enrollment.dueDate ? vnIsoDate(enrollment.dueDate) : null },
        after: { dueDate: date },
      },
    }),
  ]);

  revalidate();
  return { ok: true, message: "Đã gia hạn." };
}

export async function cancelEnrollmentAction(enrollmentId: string): Promise<ActionState> {
  const { actor, enrollment } = await findEnrollment(enrollmentId);
  if (!enrollment) return { message: NO_ACCESS };
  if (enrollment.status === "CANCELLED") return { message: "Lượt giao đã bị huỷ từ trước." };
  if (enrollment.status === "COMPLETED") return { message: "Không huỷ được lượt đã hoàn thành." };
  if (enrollment.source === "RULE" && enrollment.assignmentRule?.isActive) {
    return { message: "Đang giao tự động theo quy tắc — tắt quy tắc ở mục Quy tắc giao tự động." };
  }

  await prisma.$transaction([
    prisma.enrollment.update({ where: { id: enrollment.id }, data: { status: "CANCELLED" } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: enrollment.user.companyId,
      action: "ENROLLMENT_CANCELLED",
      entityType: "Enrollment",
      entityId: enrollment.id,
      metadata: {
        courseId: enrollment.courseId,
        courseCode: enrollment.course.code,
        learnerName: `${enrollment.user.fullName} (${enrollment.user.employeeCode})`,
        before: { status: enrollment.status },
        after: { status: "CANCELLED" },
      },
    }),
  ]);

  revalidate();
  return { ok: true, message: "Đã huỷ lượt giao." };
}

// ---------------------------------------------------------------------------------------------
// Cấp thêm lượt làm bài kiểm tra (Việc 17) — cộng vào lesson_progress.bonusAttempts

export type QuizGrantOption = {
  lessonId: string;
  title: string;
  /** Số lần đã làm trong phiên bản khoá hiện tại */
  used: number;
  /** null = không giới hạn (không cần cấp thêm) */
  maxAttempts: number | null;
  bonusAttempts: number;
  bestScore: number | null;
  passed: boolean;
};

/** Các bài kiểm tra đang dùng của khoá + tình hình làm bài của học viên (version hiện tại). */
export async function getQuizGrantOptionsAction(
  enrollmentId: string,
): Promise<{ ok: true; options: QuizGrantOption[] } | { ok: false; message: string }> {
  const { enrollment } = await findEnrollment(enrollmentId);
  if (!enrollment || enrollment.status === "CANCELLED") return { ok: false, message: NO_ACCESS };

  const lessons = await prisma.lesson.findMany({
    where: { type: "QUIZ", isArchived: false, section: { courseId: enrollment.courseId, isArchived: false } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: {
      id: true,
      title: true,
      maxAttempts: true,
      progress: { where: { userId: enrollment.userId }, select: { bonusAttempts: true } },
      quizAttempts: {
        where: { userId: enrollment.userId, courseVersion: enrollment.course.currentVersion },
        select: { score: true, passed: true },
      },
    },
  });

  return {
    ok: true,
    options: lessons.map((l) => {
      const scores = l.quizAttempts.flatMap((a) => (a.score === null ? [] : [a.score]));
      return {
        lessonId: l.id,
        title: l.title,
        used: l.quizAttempts.length,
        maxAttempts: l.maxAttempts,
        bonusAttempts: l.progress[0]?.bonusAttempts ?? 0,
        bestScore: scores.length ? Math.max(...scores) : null,
        passed: l.quizAttempts.some((a) => a.passed === true),
      };
    }),
  };
}

const grantSchema = z.object({
  lessonId: idSchema,
  count: z.coerce.number().int("Số lượt phải là số nguyên.").min(1, "Tối thiểu 1 lượt.").max(5, "Tối đa 5 lượt mỗi lần."),
});

export async function grantQuizAttemptsAction(enrollmentId: string, lessonId: string, count: number): Promise<ActionState> {
  const { actor, enrollment } = await findEnrollment(enrollmentId);
  if (!enrollment) return { message: NO_ACCESS };
  if (enrollment.status === "CANCELLED") return { message: "Lượt giao đã bị huỷ — không cấp thêm lượt làm bài được." };

  const parsed = grantSchema.safeParse({ lessonId, count });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { errors: { [issue.path[0] === "lessonId" ? "lessonId" : "count"]: issue.message } };
  }

  // Bài phải là bài kiểm tra đang dùng của ĐÚNG khoá được giao (không tin id từ trình duyệt)
  const lesson = await prisma.lesson.findFirst({
    where: {
      id: parsed.data.lessonId,
      type: "QUIZ",
      isArchived: false,
      section: { courseId: enrollment.courseId, isArchived: false },
    },
    select: { id: true, title: true, maxAttempts: true },
  });
  if (!lesson) return { errors: { lessonId: "Bài kiểm tra không thuộc khoá học này." } };
  if (lesson.maxAttempts === null) return { errors: { lessonId: "Bài này không giới hạn số lần làm — không cần cấp thêm." } };

  const userId = enrollment.userId;
  await prisma.$transaction([
    prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId, lessonId: lesson.id } },
      create: { userId, lessonId: lesson.id, bonusAttempts: parsed.data.count },
      update: { bonusAttempts: { increment: parsed.data.count } },
    }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: enrollment.user.companyId,
      action: "QUIZ_ATTEMPTS_GRANTED",
      entityType: "Enrollment",
      entityId: enrollment.id,
      metadata: {
        courseCode: enrollment.course.code,
        learnerName: `${enrollment.user.fullName} (${enrollment.user.employeeCode})`,
        lessonTitle: lesson.title,
        count: parsed.data.count,
      },
    }),
    // Báo cho học viên — mở thẳng trang bài kiểm tra
    notify(prisma, {
      userIds: [userId],
      type: "QUIZ_ATTEMPTS_GRANTED",
      title: `Bạn được cấp thêm ${parsed.data.count} lượt làm bài “${lesson.title}” (${enrollment.course.code})`,
      link: `/learn/${enrollment.courseId}/${lesson.id}`,
    }),
  ]);

  revalidate();
  return { ok: true, message: `Đã cấp thêm ${parsed.data.count} lượt làm bài “${lesson.title}” cho ${enrollment.user.fullName}.` };
}
