"use server";

import { revalidatePath } from "next/cache";
import type { Role } from "@prisma/client";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { assignOptionIds, contentPreview, parseOptions, questionInputSchema } from "@/lib/question-bank";
import { deleteFile, saveFile } from "@/lib/storage";
import { findCourseForEdit, findQuestionForEdit } from "./scope";

/**
 * Ngân hàng câu hỏi — Biên soạn, Admin công ty, Admin tập đoàn.
 * Chỉ sửa câu hỏi của khoá mình được sửa (canEditCourse); khoá công ty tổng thì công ty con chỉ xem.
 * Xoá hẳn chỉ khi khoá chưa phát hành lần nào (currentVersion = 0); đã phát hành thì chỉ tắt.
 */

const ROLES: Role[] = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"];
const FIELDS = ["content", "topic", "type", "options", "explanation"];
const NO_ACCESS = "Không tìm thấy khoá học / câu hỏi hoặc bạn không có quyền sửa.";
const PUBLISHED_NO_DELETE = "Khoá đã phát hành — chỉ tắt được câu hỏi, không xoá.";

function revalidate(courseId: string) {
  revalidatePath("/content/questions");
  revalidatePath(`/content/courses/${courseId}`);
}

/** Đọc + kiểm tra dữ liệu form (dùng chung thêm / sửa). */
function parseForm(formData: FormData) {
  let options: unknown = [];
  try {
    options = JSON.parse(String(formData.get("options") ?? "[]"));
  } catch {
    options = null;
  }
  return questionInputSchema.safeParse({
    content: String(formData.get("content") ?? ""),
    topic: String(formData.get("topic") ?? ""),
    type: String(formData.get("type") ?? ""),
    options: Array.isArray(options) ? options.slice(0, 20) : [],
    explanation: String(formData.get("explanation") ?? ""),
  });
}

function fail(formData: FormData, errors: Record<string, string>): ActionState {
  return { errors, values: formValues(formData, FIELDS) };
}

/** Ảnh mới (nếu có) — lưu sau khi dữ liệu đã hợp lệ. */
async function saveImage(formData: FormData, courseId: string): Promise<{ key: string | null } | { error: string }> {
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { key: null };
  const saved = await saveFile(file, `courses/${courseId}/questions`, "image");
  return "error" in saved ? { error: saved.error } : { key: saved.key };
}

export async function createQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(ROLES);
  const course = await findCourseForEdit(actor, formData.get("courseId"));
  if (!course) return { message: NO_ACCESS };

  const parsed = parseForm(formData);
  if (!parsed.success) return fail(formData, fieldErrors(parsed.error));
  const input = parsed.data;

  const image = await saveImage(formData, course.id);
  if ("error" in image) return fail(formData, { image: image.error });

  const options = assignOptionIds(input.options);
  try {
    await prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          courseId: course.id,
          topic: input.topic,
          type: input.type,
          content: input.content,
          imageUrl: image.key,
          options,
          explanation: input.explanation,
          // Câu tạo tay: không phải AI, dùng được ngay
          isAiCreated: false,
          isApproved: true,
        },
      });
      await logAudit(tx, {
        actorId: actor.id,
        companyId: course.ownerCompanyId,
        action: "QUESTION_CREATED",
        entityType: "Question",
        entityId: question.id,
        metadata: { courseCode: course.code, topic: input.topic, contentPreview: contentPreview(input.content) },
      });
    });
  } catch (error) {
    await deleteFile(image.key);
    throw error;
  }

  revalidate(course.id);
  return { ok: true, message: "Đã thêm câu hỏi." };
}

export async function updateQuestionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole(ROLES);
  const question = await findQuestionForEdit(actor, formData.get("id"));
  if (!question) return { message: NO_ACCESS };
  const course = question.course;

  const parsed = parseForm(formData);
  if (!parsed.success) return fail(formData, fieldErrors(parsed.error));
  const input = parsed.data;

  const image = await saveImage(formData, course.id);
  if ("error" in image) return fail(formData, { image: image.error });
  const removeImage = formData.get("removeImage") === "1";
  const imageUrl = image.key ?? (removeImage ? null : question.imageUrl);

  // Giữ id phương án cũ (bài làm đã lưu tham chiếu id này)
  const options = assignOptionIds(input.options, parseOptions(question.options));

  try {
    await prisma.$transaction([
      prisma.question.update({
        where: { id: question.id },
        data: {
          topic: input.topic,
          type: input.type,
          content: input.content,
          imageUrl,
          options,
          explanation: input.explanation,
        },
      }),
      logAudit(prisma, {
        actorId: actor.id,
        companyId: course.ownerCompanyId,
        action: "QUESTION_UPDATED",
        entityType: "Question",
        entityId: question.id,
        metadata: {
          courseCode: course.code,
          topic: input.topic,
          contentPreview: contentPreview(input.content),
          ...(question.topic !== input.topic && { before: { topic: question.topic }, after: { topic: input.topic } }),
        },
      }),
    ]);
  } catch (error) {
    await deleteFile(image.key);
    throw error;
  }

  // Ảnh cũ bị thay / bỏ -> xoá file sau khi đã lưu xong
  if (question.imageUrl && question.imageUrl !== imageUrl) await deleteFile(question.imageUrl);

  revalidate(course.id);
  return { ok: true, message: "Đã cập nhật câu hỏi." };
}

export async function toggleQuestionAction(questionId: string): Promise<ActionState> {
  const actor = await requireRole(ROLES);
  const question = await findQuestionForEdit(actor, questionId);
  if (!question) return { message: NO_ACCESS };

  const isActive = !question.isActive;
  await prisma.$transaction([
    prisma.question.update({ where: { id: question.id }, data: { isActive } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: question.course.ownerCompanyId,
      action: "QUESTION_TOGGLED",
      entityType: "Question",
      entityId: question.id,
      metadata: {
        courseCode: question.course.code,
        topic: question.topic,
        contentPreview: contentPreview(question.content),
        isActive,
      },
    }),
  ]);

  revalidate(question.course.id);
  return { ok: true, message: isActive ? "Đã bật lại câu hỏi." : "Đã tắt câu hỏi — câu này không được rút vào đề nữa." };
}

export async function deleteQuestionAction(questionId: string): Promise<ActionState> {
  const actor = await requireRole(ROLES);
  const question = await findQuestionForEdit(actor, questionId);
  if (!question) return { message: NO_ACCESS };
  if (question.course.currentVersion > 0) return { message: PUBLISHED_NO_DELETE };

  await prisma.$transaction([
    prisma.question.delete({ where: { id: question.id } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: question.course.ownerCompanyId,
      action: "QUESTION_DELETED",
      entityType: "Question",
      entityId: question.id,
      metadata: {
        courseCode: question.course.code,
        topic: question.topic,
        contentPreview: contentPreview(question.content),
      },
    }),
  ]);
  await deleteFile(question.imageUrl);

  revalidate(question.course.id);
  return { ok: true, message: "Đã xoá câu hỏi." };
}
