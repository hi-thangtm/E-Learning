"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { assignCourse, previewAssignment, type AssignCounts } from "@/lib/assignment";
import { assignableCoursesWhere, ruleUsersWhere } from "@/lib/assignment-scope";
import { logAudit } from "@/lib/audit";
import { getGroupCompanyId } from "@/lib/course-scope";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { dueAfterDays } from "@/lib/format";
import { describeRuleTarget } from "@/lib/rule-describe";
import { getNumberSetting } from "@/lib/settings";
import type { RuleConditions, RulePreview } from "./types";

/**
 * Giao tự động theo quy tắc (docs/database.md — Quy tắc 1, 3).
 * - Admin công ty: chỉ quy tắc của công ty mình, công ty áp dụng luôn = công ty mình.
 * - Khoá của công ty con chỉ áp dụng trong công ty đó. Khoá phải PUBLISHED mới giao.
 * - Lưu / bật lại -> giao ngay cho mọi người đang khớp (source RULE, hạn hôm nay + N ngày).
 * - Thu hẹp nhóm KHÔNG thu hồi lượt đã giao. Tắt: giữ lượt đã giao, hoặc huỷ các lượt CHƯA BẮT ĐẦU của quy tắc.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN"] as const;
const NO_ACCESS = "Không tìm thấy quy tắc hoặc bạn không có quyền.";
const FIELDS = ["name", "courseId", "dueInDays", "targetCompanyId", "departmentId", "positionId", "includeSubDepartments"];

const optionalId = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? null : v));

const conditionsSchema = z.object({
  courseId: z.string().trim().min(1, "Vui lòng chọn khoá học.").max(50),
  targetCompanyId: optionalId,
  departmentId: optionalId,
  positionId: optionalId,
  includeSubDepartments: z.boolean(),
});

const ruleSchema = z.object({
  name: z
    .string()
    .trim()
    .transform((v) => v.replace(/\s+/g, " "))
    .pipe(z.string().min(3, "Tên quy tắc tối thiểu 3 ký tự.").max(150, "Tên quy tắc tối đa 150 ký tự.")),
  dueInDays: z
    .string()
    .trim()
    .refine((v) => /^\d{1,3}$/.test(v) && Number(v) >= 1 && Number(v) <= 365, "Hạn từ 1 đến 365 ngày.")
    .transform(Number),
});

type Resolved = {
  course: { id: string; code: string; title: string; ownerCompanyId: string; status: string };
  targetCompanyId: string | null;
  departmentId: string | null;
  positionId: string | null;
  includeSubDepartments: boolean;
  names: { companyName: string | null; departmentName: string | null; positionName: string | null };
};

/**
 * Kiểm tra điều kiện theo phạm vi người thao tác. `current` = quy tắc đang sửa (khoá cố định; phòng ban / chức danh
 * đã ẩn vẫn giữ được nếu không đổi).
 */
async function resolveConditions(
  actor: CurrentUser,
  input: z.infer<typeof conditionsSchema>,
  current?: { courseId: string | null; departmentId: string | null; positionId: string | null },
): Promise<{ errors: Record<string, string> } | Resolved> {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const courseId = current?.courseId ?? input.courseId;
  const course = current
    ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, ownerCompanyId: true, status: true } })
    : await prisma.course.findFirst({
        where: { AND: [await assignableCoursesWhere(actor), { id: courseId }] },
        select: { id: true, code: true, title: true, ownerCompanyId: true, status: true },
      });
  if (!course) return { errors: { courseId: "Khoá học không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn." } };

  const groupId = await getGroupCompanyId();
  let targetCompanyId = isGroupAdmin ? input.targetCompanyId : actor.companyId;
  // Khoá của công ty con chỉ áp dụng trong công ty đó
  if (course.ownerCompanyId !== groupId) {
    if (targetCompanyId && targetCompanyId !== course.ownerCompanyId) {
      return { errors: { targetCompanyId: "Khoá của công ty con chỉ giao được cho người trong công ty đó." } };
    }
    targetCompanyId = course.ownerCompanyId;
  }

  let companyName: string | null = null;
  if (targetCompanyId) {
    const company = await prisma.company.findUnique({ where: { id: targetCompanyId }, select: { name: true } });
    if (!company) return { errors: { targetCompanyId: "Công ty không tồn tại." } };
    companyName = company.name;
  }

  let departmentName: string | null = null;
  if (input.departmentId) {
    if (!targetCompanyId) return { errors: { departmentId: "Chọn công ty trước khi chọn phòng ban." } };
    const d = await prisma.department.findUnique({ where: { id: input.departmentId }, select: { companyId: true, name: true, isActive: true } });
    if (!d || d.companyId !== targetCompanyId) return { errors: { departmentId: "Phòng ban phải thuộc công ty đã chọn." } };
    if (!d.isActive && input.departmentId !== current?.departmentId) return { errors: { departmentId: "Phòng ban đã bị ẩn." } };
    departmentName = d.name;
  }

  let positionName: string | null = null;
  if (input.positionId) {
    const p = await prisma.position.findUnique({ where: { id: input.positionId }, select: { name: true, isActive: true } });
    if (!p) return { errors: { positionId: "Chức danh không tồn tại." } };
    if (!p.isActive && input.positionId !== current?.positionId) return { errors: { positionId: "Chức danh đã bị ẩn." } };
    positionName = p.name;
  }

  return {
    course,
    targetCompanyId,
    departmentId: input.departmentId,
    positionId: input.positionId,
    includeSubDepartments: input.departmentId ? input.includeSubDepartments : true,
    names: { companyName, departmentName, positionName },
  };
}

async function matchingUserIds(r: Pick<Resolved, "course" | "targetCompanyId" | "departmentId" | "includeSubDepartments" | "positionId">) {
  const where = await ruleUsersWhere(r, r.course.ownerCompanyId);
  return prisma.user.findMany({ where, select: { id: true }, orderBy: { fullName: "asc" } });
}

function ruleScopeWhere(actor: CurrentUser): Prisma.AssignmentRuleWhereInput {
  return actor.role === "GROUP_ADMIN" ? {} : { ownerCompanyId: actor.companyId };
}

async function findRule(actor: CurrentUser, ruleId: string) {
  if (!ruleId || ruleId.length > 50) return null;
  return prisma.assignmentRule.findFirst({
    where: { id: ruleId, ...ruleScopeWhere(actor) },
    select: {
      id: true,
      name: true,
      courseId: true,
      ownerCompanyId: true,
      targetCompanyId: true,
      departmentId: true,
      includeSubDepartments: true,
      positionId: true,
      dueInDays: true,
      isActive: true,
      course: { select: { id: true, code: true, title: true, ownerCompanyId: true, status: true } },
    },
  });
}

/** Giao ngay cho mọi người đang khớp quy tắc (nếu khoá còn PUBLISHED). */
async function runRule(
  actor: CurrentUser,
  rule: { id: string; dueInDays: number } & Pick<Resolved, "course" | "targetCompanyId" | "departmentId" | "includeSubDepartments" | "positionId">,
): Promise<AssignCounts | null> {
  if (rule.course.status !== "PUBLISHED") return null;
  const users = await matchingUserIds(rule);
  if (users.length === 0) return null;
  return assignCourse({
    courseId: rule.course.id,
    userIds: users.map((u) => u.id),
    due: dueAfterDays(rule.dueInDays),
    source: "RULE",
    assignmentRuleId: rule.id,
    actorId: actor.id,
  });
}

function assignedMessage(counts: AssignCounts | null, publishedCourse: boolean): string {
  if (!publishedCourse) return " Khoá học chưa / không còn phát hành nên quy tắc tạm chưa giao.";
  if (!counts) return " Hiện chưa có ai khớp nhóm áp dụng.";
  return ` Đã giao mới ${counts.created + counts.reactivated} người${counts.shortened ? `, rút ngắn hạn ${counts.shortened} người` : ""}.`;
}

// ---------------------------------------------------------------------------------------------

/** Xem trước trực tiếp khi đổi điều kiện (không ghi gì). */
export async function previewRuleAction(conditions: RuleConditions, dueInDays: number, ruleId?: string): Promise<RulePreview> {
  const actor = await requireRole([...ROLES]);
  const parsed = conditionsSchema.safeParse(conditions);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Điều kiện không hợp lệ." };
  const current = ruleId ? await findRule(actor, ruleId) : null;
  if (ruleId && !current) return { ok: false, message: NO_ACCESS };

  const resolved = await resolveConditions(actor, parsed.data, current ?? undefined);
  if ("errors" in resolved) return { ok: false, message: Object.values(resolved.errors)[0] };

  const users = await matchingUserIds(resolved);
  const days = Number.isInteger(dueInDays) && dueInDays >= 1 && dueInDays <= 365 ? dueInDays : await getNumberSetting("DEFAULT_DUE_DAYS", 30);
  const counts = await previewAssignment({ courseId: resolved.course.id, userIds: users.map((u) => u.id), due: dueAfterDays(days) });
  const first = await prisma.user.findMany({
    where: { id: { in: users.slice(0, 10).map((u) => u.id) } },
    orderBy: { fullName: "asc" },
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      company: { select: { code: true } },
      department: { select: { name: true } },
      position: { select: { name: true } },
    },
  });

  return {
    ok: true,
    matched: users.length,
    newCount: counts.created + counts.reactivated,
    existingCount: counts.shortened + counts.unchanged,
    completedCount: counts.completed,
    target: describeRuleTarget({ ...resolved.names, includeSubDepartments: resolved.includeSubDepartments }),
    coursePublished: resolved.course.status === "PUBLISHED",
    users: first.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      employeeCode: u.employeeCode,
      companyCode: u.company.code,
      departmentName: u.department?.name ?? null,
      positionName: u.position?.name ?? null,
    })),
  };
}

export async function saveRuleAction(_prev: ActionState, formData: FormData): Promise<ActionState & { ruleId?: string }> {
  const actor = await requireRole([...ROLES]);
  const ruleId = String(formData.get("id") ?? "");
  const current = ruleId ? await findRule(actor, ruleId) : null;
  if (ruleId && !current) return { message: NO_ACCESS };
  const fail = (errors: Record<string, string>) => ({ errors, values: formValues(formData, FIELDS) });

  const base = ruleSchema.safeParse({ name: formData.get("name") ?? "", dueInDays: formData.get("dueInDays") ?? "" });
  if (!base.success) return fail(fieldErrors(base.error));
  const cond = conditionsSchema.safeParse({
    courseId: String(formData.get("courseId") ?? current?.courseId ?? ""),
    targetCompanyId: String(formData.get("targetCompanyId") ?? ""),
    departmentId: String(formData.get("departmentId") ?? ""),
    positionId: String(formData.get("positionId") ?? ""),
    includeSubDepartments: formData.get("includeSubDepartments") === "1",
  });
  if (!cond.success) return fail(fieldErrors(cond.error));

  const resolved = await resolveConditions(actor, cond.data, current ?? undefined);
  if ("errors" in resolved) return fail(resolved.errors);

  const data = {
    name: base.data.name,
    dueInDays: base.data.dueInDays,
    targetCompanyId: resolved.targetCompanyId,
    departmentId: resolved.departmentId,
    includeSubDepartments: resolved.includeSubDepartments,
    positionId: resolved.positionId,
  };
  const target = describeRuleTarget({ ...resolved.names, includeSubDepartments: resolved.includeSubDepartments });
  const companyId = resolved.targetCompanyId ?? actor.companyId;

  let id: string;
  let isActive: boolean;
  if (current) {
    await prisma.$transaction([
      prisma.assignmentRule.update({ where: { id: current.id }, data }),
      logAudit(prisma, {
        actorId: actor.id,
        companyId,
        action: "ASSIGNMENT_RULE_UPDATED",
        entityType: "AssignmentRule",
        entityId: current.id,
        metadata: {
          ruleName: data.name,
          courseCode: resolved.course.code,
          before: { name: current.name, dueInDays: current.dueInDays },
          after: { name: data.name, dueInDays: data.dueInDays },
          target,
        },
      }),
    ]);
    id = current.id;
    isActive = current.isActive;
  } else {
    id = await prisma.$transaction(async (tx) => {
      const rule = await tx.assignmentRule.create({
        data: { ...data, ownerCompanyId: actor.companyId, courseId: resolved.course.id, isActive: true },
        select: { id: true },
      });
      await logAudit(tx, {
        actorId: actor.id,
        companyId,
        action: "ASSIGNMENT_RULE_CREATED",
        entityType: "AssignmentRule",
        entityId: rule.id,
        metadata: { ruleName: data.name, courseId: resolved.course.id, courseCode: resolved.course.code, target, dueInDays: data.dueInDays },
      });
      return rule.id;
    });
    isActive = true;
  }

  // Đang chạy -> giao ngay cho người đang khớp (thu hẹp nhóm không thu hồi lượt đã giao)
  const counts = isActive ? await runRule(actor, { id, dueInDays: data.dueInDays, ...resolved }) : null;

  revalidatePath("/assign/rules");
  revalidatePath("/assign/manual");
  return {
    ok: true,
    ruleId: id,
    message: `${current ? "Đã lưu quy tắc." : "Đã tạo quy tắc."}${isActive ? assignedMessage(counts, resolved.course.status === "PUBLISHED") : " Quy tắc đang tắt."}`,
  };
}

export async function disableRuleAction(ruleId: string, mode: "keep" | "cancelNotStarted"): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const rule = await findRule(actor, ruleId);
  if (!rule) return { message: NO_ACCESS };
  if (!rule.isActive) return { message: "Quy tắc đã tắt từ trước." };
  const cancel = mode === "cancelNotStarted";

  const cancelledCount = await prisma.$transaction(async (tx) => {
    await tx.assignmentRule.update({ where: { id: rule.id }, data: { isActive: false } });
    // Lượt đang học / đã xong luôn giữ; chỉ huỷ lượt CHƯA BẮT ĐẦU của chính quy tắc này
    const res = cancel
      ? await tx.enrollment.updateMany({
          where: { assignmentRuleId: rule.id, source: "RULE", status: "NOT_STARTED" },
          data: { status: "CANCELLED" },
        })
      : { count: 0 };
    await logAudit(tx, {
      actorId: actor.id,
      companyId: rule.targetCompanyId ?? rule.ownerCompanyId,
      action: "ASSIGNMENT_RULE_DISABLED",
      entityType: "AssignmentRule",
      entityId: rule.id,
      metadata: { ruleName: rule.name, courseCode: rule.course?.code ?? null, cancelMode: mode === "cancelNotStarted" ? "cancelNotStarted" : "keep", cancelledCount: res.count },
    });
    return res.count;
  });

  revalidatePath("/assign/rules");
  revalidatePath("/assign/manual");
  return {
    ok: true,
    message: cancel ? `Đã tắt quy tắc và huỷ ${cancelledCount} lượt chưa bắt đầu.` : "Đã tắt quy tắc. Các lượt đã giao được giữ nguyên.",
  };
}

export async function enableRuleAction(ruleId: string): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const rule = await findRule(actor, ruleId);
  if (!rule || !rule.course) return { message: NO_ACCESS };
  if (rule.isActive) return { message: "Quy tắc đang chạy." };

  await prisma.$transaction([
    prisma.assignmentRule.update({ where: { id: rule.id }, data: { isActive: true } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: rule.targetCompanyId ?? rule.ownerCompanyId,
      action: "ASSIGNMENT_RULE_ENABLED",
      entityType: "AssignmentRule",
      entityId: rule.id,
      metadata: { ruleName: rule.name, courseCode: rule.course.code },
    }),
  ]);
  const counts = await runRule(actor, {
    id: rule.id,
    dueInDays: rule.dueInDays ?? (await getNumberSetting("DEFAULT_DUE_DAYS", 30)),
    course: rule.course,
    targetCompanyId: rule.targetCompanyId,
    departmentId: rule.departmentId,
    includeSubDepartments: rule.includeSubDepartments,
    positionId: rule.positionId,
  });

  revalidatePath("/assign/rules");
  revalidatePath("/assign/manual");
  return { ok: true, message: `Đã bật quy tắc.${assignedMessage(counts, rule.course.status === "PUBLISHED")}` };
}
