"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { assignCourse, assignPath, previewAssignment, previewPathAssignment } from "@/lib/assignment";
import { assignableCoursesWhere, assignmentRuleScopeWhere, ruleUsersWhere } from "@/lib/assignment-scope";
import { logAudit } from "@/lib/audit";
import { getGroupCompanyId } from "@/lib/course-scope";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { dueAfterDays } from "@/lib/format";
import { assignablePathsWhere } from "@/lib/path-scope";
import { describeRuleTarget } from "@/lib/rule-describe";
import { getSetting } from "@/lib/settings";
import type { RuleConditions, RuleKind, RulePreview } from "./types";

/**
 * Giao tự động theo quy tắc (docs/database.md — Quy tắc 1, 3). Quy tắc giao 1 khoá học HOẶC 1 lộ trình.
 * - Admin công ty: chỉ quy tắc của công ty mình, công ty áp dụng luôn = công ty mình.
 * - Khoá / lộ trình của công ty con chỉ áp dụng trong công ty đó. Phải PUBLISHED mới giao.
 * - Lưu / bật lại -> giao ngay cho mọi người đang khớp (source RULE, hạn hôm nay + N ngày).
 * - Thu hẹp nhóm KHÔNG thu hồi lượt đã giao. Tắt: giữ lượt đã giao, hoặc huỷ các lượt CHƯA BẮT ĐẦU của quy tắc.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN"] as const;
const NO_ACCESS = "Không tìm thấy quy tắc hoặc bạn không có quyền.";
const FIELDS = ["name", "kind", "subjectId", "dueInDays", "targetCompanyId", "departmentId", "positionId", "includeSubDepartments"];
const KIND_NOUN: Record<RuleKind, string> = { course: "Khoá học", path: "Lộ trình" };

const optionalId = z
  .string()
  .trim()
  .max(50)
  .transform((v) => (v === "" ? null : v));

const conditionsSchema = z.object({
  kind: z.enum(["course", "path"], "Loại quy tắc không hợp lệ."),
  subjectId: z.string().trim().min(1, "Vui lòng chọn khoá học / lộ trình.").max(50),
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

/** Đối tượng giao của quy tắc: khoá học hoặc lộ trình. */
type Subject = { kind: RuleKind; id: string; code: string; title: string; ownerCompanyId: string; status: string };

type Resolved = {
  subject: Subject;
  targetCompanyId: string | null;
  departmentId: string | null;
  positionId: string | null;
  includeSubDepartments: boolean;
  names: { companyName: string | null; departmentName: string | null; positionName: string | null };
};

const SUBJECT_SELECT = { id: true, code: true, title: true, ownerCompanyId: true, status: true } as const;

/** Khoá / lộ trình theo id. `assignableOnly` = chỉ cái đang PUBLISHED trong phạm vi (khi tạo quy tắc mới). */
async function loadSubject(actor: CurrentUser, kind: RuleKind, id: string, assignableOnly: boolean): Promise<Subject | null> {
  const row =
    kind === "course"
      ? await prisma.course.findFirst({
          where: { AND: [assignableOnly ? await assignableCoursesWhere(actor) : {}, { id }] },
          select: SUBJECT_SELECT,
        })
      : await prisma.learningPath.findFirst({
          where: { AND: [assignableOnly ? await assignablePathsWhere(actor) : {}, { id }] },
          select: SUBJECT_SELECT,
        });
  return row ? { kind, ...row } : null;
}

/**
 * Kiểm tra điều kiện theo phạm vi người thao tác. `current` = quy tắc đang sửa (khoá / lộ trình cố định; phòng ban /
 * chức danh đã ẩn vẫn giữ được nếu không đổi).
 */
async function resolveConditions(
  actor: CurrentUser,
  input: z.infer<typeof conditionsSchema>,
  current?: { subject: Subject; departmentId: string | null; positionId: string | null },
): Promise<{ errors: Record<string, string> } | Resolved> {
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const subject = current?.subject ?? (await loadSubject(actor, input.kind, input.subjectId, true));
  if (!subject) {
    return {
      errors: {
        subjectId: `${KIND_NOUN[input.kind]} không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn.`,
      },
    };
  }

  const groupId = await getGroupCompanyId();
  let targetCompanyId = isGroupAdmin ? input.targetCompanyId : actor.companyId;
  // Khoá / lộ trình của công ty con chỉ áp dụng trong công ty đó
  if (subject.ownerCompanyId !== groupId) {
    if (targetCompanyId && targetCompanyId !== subject.ownerCompanyId) {
      return { errors: { targetCompanyId: `${KIND_NOUN[subject.kind]} của công ty con chỉ giao được cho người trong công ty đó.` } };
    }
    targetCompanyId = subject.ownerCompanyId;
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
    subject,
    targetCompanyId,
    departmentId: input.departmentId,
    positionId: input.positionId,
    includeSubDepartments: input.departmentId ? input.includeSubDepartments : true,
    names: { companyName, departmentName, positionName },
  };
}

type RuleShape = Pick<Resolved, "subject" | "targetCompanyId" | "departmentId" | "includeSubDepartments" | "positionId">;

async function matchingUserIds(r: RuleShape) {
  const where = await ruleUsersWhere(r, r.subject.ownerCompanyId);
  return prisma.user.findMany({ where, select: { id: true }, orderBy: { fullName: "asc" } });
}


async function findRule(actor: CurrentUser, ruleId: string) {
  if (!ruleId || ruleId.length > 50) return null;
  const rule = await prisma.assignmentRule.findFirst({
    where: { id: ruleId, ...assignmentRuleScopeWhere(actor) },
    select: {
      id: true,
      name: true,
      ownerCompanyId: true,
      targetCompanyId: true,
      departmentId: true,
      includeSubDepartments: true,
      positionId: true,
      dueInDays: true,
      isActive: true,
      course: { select: SUBJECT_SELECT },
      learningPath: { select: SUBJECT_SELECT },
    },
  });
  if (!rule) return null;
  const { course, learningPath, ...rest } = rule;
  const subject: Subject | null = course ? { kind: "course", ...course } : learningPath ? { kind: "path", ...learningPath } : null;
  return subject ? { ...rest, subject } : null;
}

/** Audit: mã khoá / lộ trình của quy tắc. */
function subjectMeta(s: Subject) {
  return s.kind === "course" ? { courseCode: s.code } : { pathCode: s.code };
}

type RunResult = { newLearners: number; shortened: number } | null;

/** Giao ngay cho mọi người đang khớp quy tắc (nếu khoá / lộ trình còn PUBLISHED). */
async function runRule(actor: CurrentUser, rule: { id: string; dueInDays: number } & RuleShape): Promise<RunResult> {
  if (rule.subject.status !== "PUBLISHED") return null;
  const users = await matchingUserIds(rule);
  if (users.length === 0) return null;
  const common = {
    userIds: users.map((u) => u.id),
    due: dueAfterDays(rule.dueInDays),
    source: "RULE" as const,
    assignmentRuleId: rule.id,
    actorId: actor.id,
  };
  if (rule.subject.kind === "path") {
    const r = await assignPath({ ...common, learningPathId: rule.subject.id });
    return { newLearners: r.newLearners, shortened: r.shortened };
  }
  const c = await assignCourse({ ...common, courseId: rule.subject.id });
  return { newLearners: c.created + c.reactivated, shortened: c.shortened };
}

function assignedMessage(result: RunResult, subject: Subject): string {
  const noun = subject.kind === "path" ? "Lộ trình" : "Khoá học";
  if (subject.status !== "PUBLISHED") return ` ${noun} chưa / không còn phát hành nên quy tắc tạm chưa giao.`;
  if (!result) return " Hiện chưa có ai khớp nhóm áp dụng.";
  return ` Đã giao mới ${result.newLearners} người${result.shortened ? `, rút ngắn hạn ${result.shortened} lượt` : ""}.`;
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
  const userIds = users.map((u) => u.id);
  let newCount: number, existingCount: number, completedCount: number;
  if (resolved.subject.kind === "path") {
    const p = await previewPathAssignment({ learningPathId: resolved.subject.id, userIds });
    [newCount, existingCount, completedCount] = [p.newLearners, p.alreadyHasPath, p.completedAll];
  } else {
    const days = Number.isInteger(dueInDays) && dueInDays >= 1 && dueInDays <= 365 ? dueInDays : await getSetting("DEFAULT_DUE_DAYS");
    const c = await previewAssignment({ courseId: resolved.subject.id, userIds, due: dueAfterDays(days) });
    [newCount, existingCount, completedCount] = [c.created + c.reactivated, c.shortened + c.unchanged, c.completed];
  }
  const first = await prisma.user.findMany({
    where: { id: { in: userIds.slice(0, 10) } },
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
    kind: resolved.subject.kind,
    matched: users.length,
    newCount,
    existingCount,
    completedCount,
    target: describeRuleTarget({ ...resolved.names, includeSubDepartments: resolved.includeSubDepartments }),
    coursePublished: resolved.subject.status === "PUBLISHED",
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
    kind: String(formData.get("kind") ?? current?.subject.kind ?? "course"),
    subjectId: String(formData.get("subjectId") ?? current?.subject.id ?? ""),
    targetCompanyId: String(formData.get("targetCompanyId") ?? ""),
    departmentId: String(formData.get("departmentId") ?? ""),
    positionId: String(formData.get("positionId") ?? ""),
    includeSubDepartments: formData.get("includeSubDepartments") === "1",
  });
  if (!cond.success) return fail(fieldErrors(cond.error));

  const resolved = await resolveConditions(actor, cond.data, current ?? undefined);
  if ("errors" in resolved) return fail(resolved.errors);
  const { subject } = resolved;

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
          ...subjectMeta(subject),
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
        data: {
          ...data,
          ownerCompanyId: actor.companyId,
          ...(subject.kind === "course" ? { courseId: subject.id } : { learningPathId: subject.id }),
          isActive: true,
        },
        select: { id: true },
      });
      await logAudit(tx, {
        actorId: actor.id,
        companyId,
        action: "ASSIGNMENT_RULE_CREATED",
        entityType: "AssignmentRule",
        entityId: rule.id,
        metadata: {
          ruleName: data.name,
          ...(subject.kind === "course" ? { courseId: subject.id } : { learningPathId: subject.id }),
          ...subjectMeta(subject),
          target,
          dueInDays: data.dueInDays,
        },
      });
      return rule.id;
    });
    isActive = true;
  }

  // Đang chạy -> giao ngay cho người đang khớp (thu hẹp nhóm không thu hồi lượt đã giao)
  const result = isActive ? await runRule(actor, { id, dueInDays: data.dueInDays, ...resolved }) : null;

  revalidatePath("/assign/rules");
  revalidatePath("/assign/manual");
  return {
    ok: true,
    ruleId: id,
    message: `${current ? "Đã lưu quy tắc." : "Đã tạo quy tắc."}${isActive ? assignedMessage(result, subject) : " Quy tắc đang tắt."}`,
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
      metadata: {
        ruleName: rule.name,
        ...subjectMeta(rule.subject),
        cancelMode: mode === "cancelNotStarted" ? "cancelNotStarted" : "keep",
        cancelledCount: res.count,
      },
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
  if (!rule) return { message: NO_ACCESS };
  if (rule.isActive) return { message: "Quy tắc đang chạy." };

  await prisma.$transaction([
    prisma.assignmentRule.update({ where: { id: rule.id }, data: { isActive: true } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: rule.targetCompanyId ?? rule.ownerCompanyId,
      action: "ASSIGNMENT_RULE_ENABLED",
      entityType: "AssignmentRule",
      entityId: rule.id,
      metadata: { ruleName: rule.name, ...subjectMeta(rule.subject) },
    }),
  ]);
  const result = await runRule(actor, {
    id: rule.id,
    dueInDays: rule.dueInDays ?? (await getSetting("DEFAULT_DUE_DAYS")),
    subject: rule.subject,
    targetCompanyId: rule.targetCompanyId,
    departmentId: rule.departmentId,
    includeSubDepartments: rule.includeSubDepartments,
    positionId: rule.positionId,
  });

  revalidatePath("/assign/rules");
  revalidatePath("/assign/manual");
  return { ok: true, message: `Đã bật quy tắc.${assignedMessage(result, rule.subject)}` };
}
