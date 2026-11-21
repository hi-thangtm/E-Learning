"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { ActionState } from "@/lib/action-state";
import { enrollmentScopeWhere } from "@/lib/assignment-scope";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { vnDayEnd, vnIsoDate } from "@/lib/format";

/**
 * Lượt giao khoá: gia hạn, huỷ giao (docs/database.md — Quy tắc 3).
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
      user: { select: { fullName: true, employeeCode: true, companyId: true } },
      course: { select: { code: true } },
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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(new Date(`${date}T00:00:00Z`).getTime())) {
    return { errors: { dueDate: "Ngày không hợp lệ." } };
  }
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
    return { message: "Đang giao tự động theo quy tắc — tắt quy tắc ở mục Giao tự động." };
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
