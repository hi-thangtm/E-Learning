"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { findCourseInScope } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isBlankHtml, sanitizeLessonHtml } from "@/lib/sanitize";
import {
  approveProposal,
  canManageMajor,
  canProposeMajor,
  canPublishMinor,
  isUpdatable,
  previewVersionImpact,
  proposeMajor,
  publishVersion,
  rejectProposal,
} from "@/lib/versioning";

/**
 * Bản cập nhật MINOR / MAJOR (Việc 21A). Quyền kiểm tra lại ở server (src/lib/versioning.ts), không chỉ ẩn nút.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"] as const;
const NO_ACCESS = "Khoá học không tồn tại hoặc bạn không có quyền.";
const idSchema = z.string().trim().min(1).max(50);
const COURSE_SELECT = { id: true, code: true, ownerCompanyId: true, status: true, currentVersion: true } as const;

const dueSchema = z.coerce
  .number({ message: "Số ngày không hợp lệ." })
  .int("Số ngày phải là số nguyên.")
  .min(1, "Tối thiểu 1 ngày.")
  .max(365, "Tối đa 365 ngày.");

/** Tóm tắt thay đổi: lọc HTML ở server, bắt buộc có chữ. */
function cleanSummary(html: string): { ok: true; html: string } | { ok: false; error: string } {
  if (html.length > 20_000) return { ok: false, error: "Tóm tắt quá dài (tối đa khoảng 20.000 ký tự)." };
  const clean = sanitizeLessonHtml(html);
  if (isBlankHtml(clean)) return { ok: false, error: "Vui lòng nhập tóm tắt thay đổi." };
  return { ok: true, html: clean };
}

async function loadCourse(courseId: string) {
  const actor = await requireRole([...ROLES]);
  const id = idSchema.safeParse(courseId);
  const course = id.success ? await findCourseInScope(actor, id.data, COURSE_SELECT) : null;
  return { actor, course };
}

function revalidate(courseId: string) {
  revalidatePath(`/content/courses/${courseId}`);
  revalidatePath("/content/courses");
}

export async function previewImpactAction(
  courseId: string,
): Promise<{ ok: true; completed: number; inProgress: number } | { ok: false; message: string }> {
  const { actor, course } = await loadCourse(courseId);
  if (!course) return { ok: false, message: NO_ACCESS };
  if (!canPublishMinor(actor, course) && !canManageMajor(actor, course) && !canProposeMajor(actor, course)) {
    return { ok: false, message: NO_ACCESS };
  }
  return { ok: true, ...(await previewVersionImpact(course.id)) };
}

export type VersionFormInput = {
  courseId: string;
  changeType: "MINOR" | "MAJOR";
  summary: string;
  dueInDays: string;
  /** MAJOR: gõ lại mã khoá để xác nhận */
  confirmCode?: string;
};

/** Phát hành MINOR / MAJOR trực tiếp, hoặc gửi đề xuất MAJOR (Biên soạn). */
export async function publishVersionAction(input: VersionFormInput): Promise<ActionState> {
  const { actor, course } = await loadCourse(input.courseId);
  if (!course) return { message: NO_ACCESS };
  if (!isUpdatable(course)) return { message: "Chỉ phát hành bản cập nhật cho khoá đã phát hành (v1 trở lên)." };

  const summary = cleanSummary(String(input.summary ?? ""));
  if (!summary.ok) return { errors: { summary: summary.error } };
  const due = dueSchema.safeParse(input.dueInDays);
  if (!due.success) return { errors: { dueInDays: due.error.issues[0].message } };

  if (input.changeType === "MAJOR" && !canManageMajor(actor, course)) {
    // Biên soạn: MAJOR = gửi đề xuất
    if (!canProposeMajor(actor, course)) return { message: "Bạn không có quyền phát hành hay đề xuất bản MAJOR cho khoá này." };
    const r = await proposeMajor({ courseId: course.id, changeSummary: summary.html, dueInDays: due.data, actor });
    if (!r.ok) return { message: r.message };
    revalidate(course.id);
    return { ok: true, message: "Đã gửi đề xuất MAJOR — chờ Admin duyệt." };
  }

  if (input.changeType === "MAJOR" && String(input.confirmCode ?? "").trim().toUpperCase() !== course.code.toUpperCase()) {
    return { errors: { confirmCode: `Gõ đúng mã khoá “${course.code}” để xác nhận.` } };
  }
  if (input.changeType !== "MINOR" && input.changeType !== "MAJOR") return { message: "Loại cập nhật không hợp lệ." };

  const r = await publishVersion({
    courseId: course.id,
    changeType: input.changeType,
    changeSummary: summary.html,
    dueInDays: due.data,
    actor,
  });
  if (!r.ok) return { message: r.message };
  revalidate(course.id);
  return {
    ok: true,
    message:
      input.changeType === "MAJOR"
        ? `Đã phát hành v${r.versionNo} (MAJOR) — ${r.affected} người phải học lại.`
        : `Đã phát hành v${r.versionNo} (MINOR) — ${r.affected} người cần đọc & xác nhận.`,
  };
}

export async function approveProposalAction(input: {
  versionId: string;
  dueInDays: string;
  confirmCode: string;
}): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const id = idSchema.safeParse(input.versionId);
  if (!id.success) return { message: "Không xác định được đề xuất." };
  const proposal = await prisma.courseVersion.findUnique({
    where: { id: id.data },
    select: { course: { select: { id: true, code: true } } },
  });
  // Phạm vi: phải thấy được khoá
  const course = proposal ? await findCourseInScope(actor, proposal.course.id, COURSE_SELECT) : null;
  if (!course) return { message: NO_ACCESS };
  if (!canManageMajor(actor, course)) return { message: "Chỉ Admin công ty sở hữu khoá hoặc Admin tập đoàn được duyệt đề xuất." };

  const due = dueSchema.safeParse(input.dueInDays);
  if (!due.success) return { errors: { dueInDays: due.error.issues[0].message } };
  if (String(input.confirmCode ?? "").trim().toUpperCase() !== course.code.toUpperCase()) {
    return { errors: { confirmCode: `Gõ đúng mã khoá “${course.code}” để xác nhận.` } };
  }

  const r = await approveProposal(id.data, actor, { dueInDays: due.data });
  if (!r.ok) return { message: r.message };
  revalidate(course.id);
  return { ok: true, message: `Đã duyệt và phát hành v${r.versionNo} (MAJOR) — ${r.affected} người phải học lại.` };
}

export async function rejectProposalAction(versionId: string, reviewNote: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const id = idSchema.safeParse(versionId);
  if (!id.success) return { message: "Không xác định được đề xuất." };
  const note = z
    .string()
    .trim()
    .min(5, "Lý do tối thiểu 5 ký tự.")
    .max(1000, "Lý do tối đa 1.000 ký tự.")
    .safeParse(reviewNote ?? "");
  if (!note.success) return { errors: { reviewNote: note.error.issues[0].message } };

  const proposal = await prisma.courseVersion.findUnique({ where: { id: id.data }, select: { courseId: true } });
  const course = proposal ? await findCourseInScope(actor, proposal.courseId, COURSE_SELECT) : null;
  if (!course) return { message: NO_ACCESS };

  const r = await rejectProposal(id.data, actor, note.data);
  if (!r.ok) return { message: r.message };
  revalidate(course.id);
  return { ok: true, message: "Đã từ chối đề xuất và báo cho người đề xuất." };
}
