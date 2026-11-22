"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assignCourse, assignPath, previewAssignment, previewPathAssignment, type AssignCounts, type PathPreview } from "@/lib/assignment";
import {
  activeLearnerWhere,
  assignableCoursesWhere,
  departmentWithChildren,
  learnerCompaniesForCourse,
} from "@/lib/assignment-scope";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { dueAfterDays, vnDayEnd, vnIsoDate } from "@/lib/format";
import { assignablePathsWhere } from "@/lib/path-scope";
import type { DueChoice, LearnerFilter, LearnerRow, Selection, Target } from "./types";

/**
 * Trình giao thủ công — khoá học HOẶC lộ trình. Mọi action: requireRole -> khoá / lộ trình phải PUBLISHED trong phạm vi ->
 * người học phải trong phạm vi (khoá / lộ trình công ty con: chỉ công ty đó; Admin công ty: chỉ công ty mình).
 * “Chọn tất cả theo bộ lọc”: trình duyệt gửi BỘ LỌC, server tự tìm danh sách người.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN"] as const;
const PAGE_SIZE = 20;
const MAX_IDS = 5000;

const id = z.string().trim().max(50);
const targetSchema = z.object({ kind: z.enum(["course", "path"]), id: z.string().trim().min(1).max(50) });
const filterSchema = z.object({
  companyId: id.optional().default(""),
  departmentId: id.optional().default(""),
  positionId: id.optional().default(""),
  q: z.string().trim().max(100).optional().default(""),
});
const selectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ids"), ids: z.array(id).max(MAX_IDS) }),
  z.object({ mode: z.literal("filter"), filter: filterSchema }),
]);
const dueSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("days"), days: z.number().int().min(1).max(365) }),
  z.object({ mode: z.literal("date"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
]);

type Fail = { ok: false; message: string };
type Loaded = { kind: "course" | "path"; id: string; code: string; title: string; ownerCompanyId: string };

const NOT_FOUND = {
  course: "Khoá học không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn.",
  path: "Lộ trình không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn.",
} as const;

/** Khoá / lộ trình đang PUBLISHED trong phạm vi người thao tác (không tin id từ trình duyệt). */
async function loadTarget(actor: CurrentUser, target: Target): Promise<Loaded | Fail> {
  const t = targetSchema.safeParse(target);
  if (!t.success) return { ok: false, message: "Chưa chọn khoá học / lộ trình." };
  const select = { id: true, code: true, title: true, ownerCompanyId: true } as const;
  const row =
    t.data.kind === "course"
      ? await prisma.course.findFirst({ where: { AND: [await assignableCoursesWhere(actor), { id: t.data.id }] }, select })
      : await prisma.learningPath.findFirst({ where: { AND: [await assignablePathsWhere(actor), { id: t.data.id }] }, select });
  return row ? { kind: t.data.kind, ...row } : { ok: false, message: NOT_FOUND[t.data.kind] };
}

async function learnerWhere(actor: CurrentUser, target: { ownerCompanyId: string }, f: z.infer<typeof filterSchema>) {
  const companies = await learnerCompaniesForCourse(actor, target);
  const departmentIds = f.departmentId ? await departmentWithChildren(f.departmentId) : null;
  return {
    AND: [
      activeLearnerWhere(companies),
      ...(f.companyId ? [{ companyId: f.companyId }] : []),
      ...(departmentIds ? [{ departmentId: { in: departmentIds } }] : []),
      ...(f.positionId ? [{ positionId: f.positionId }] : []),
      ...(f.q
        ? [{ OR: [{ fullName: { contains: f.q, mode: "insensitive" as const } }, { employeeCode: { contains: f.q, mode: "insensitive" as const } }] }]
        : []),
    ],
  } satisfies Prisma.UserWhereInput;
}

function dueDateOf(due: z.infer<typeof dueSchema>): Date | string {
  if (due.mode === "days") return dueAfterDays(due.days);
  if (due.date <= vnIsoDate()) return "Hạn phải sau hôm nay.";
  return vnDayEnd(due.date);
}

/** Danh sách id người được chọn — luôn lọc lại theo phạm vi ở server. */
async function resolveUserIds(actor: CurrentUser, target: { ownerCompanyId: string }, selection: Selection): Promise<string[]> {
  const parsed = selectionSchema.parse(selection);
  const where =
    parsed.mode === "filter"
      ? await learnerWhere(actor, target, parsed.filter)
      : { AND: [await learnerWhere(actor, target, filterSchema.parse({})), { id: { in: parsed.ids } }] };
  const rows = await prisma.user.findMany({ where, select: { id: true }, take: MAX_IDS + 1 });
  return rows.map((r) => r.id);
}

/** Trạng thái lộ trình của từng người trên trang (đã có / đã xong toàn bộ). */
async function pathStates(pathId: string, userIds: string[]): Promise<Map<string, "HAS" | "DONE">> {
  const result = new Map<string, "HAS" | "DONE">();
  if (userIds.length === 0) return result;
  const [courseIds, has, completed] = await Promise.all([
    prisma.learningPathCourse.findMany({ where: { learningPathId: pathId }, select: { courseId: true } }),
    prisma.enrollment.findMany({
      where: { learningPathId: pathId, userId: { in: userIds }, status: { not: "CANCELLED" } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.enrollment.groupBy({
      by: ["userId"],
      where: { userId: { in: userIds }, status: "COMPLETED", course: { pathCourses: { some: { learningPathId: pathId } } } },
      _count: { _all: true },
    }),
  ]);
  for (const h of has) result.set(h.userId, "HAS");
  for (const c of completed) if (courseIds.length > 0 && c._count._all >= courseIds.length) result.set(c.userId, "DONE");
  return result;
}

export async function searchLearnersAction(
  target: Target,
  filter: LearnerFilter,
  page: number,
): Promise<{ ok: true; rows: LearnerRow[]; total: number; pageSize: number } | Fail> {
  const actor = await requireRole([...ROLES]);
  const t = await loadTarget(actor, target);
  if ("ok" in t) return t;
  const f = filterSchema.safeParse(filter);
  if (!f.success) return { ok: false, message: "Bộ lọc không hợp lệ." };

  const where = await learnerWhere(actor, t, f.data);
  const p = Math.max(1, Math.floor(Number(page) || 1));
  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ fullName: "asc" }, { employeeCode: "asc" }],
      skip: (p - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        company: { select: { code: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
        enrollments: { where: { courseId: t.kind === "course" ? t.id : "__none__" }, select: { status: true } },
      },
    }),
  ]);
  const states = t.kind === "path" ? await pathStates(t.id, users.map((u) => u.id)) : new Map<string, "HAS" | "DONE">();

  return {
    ok: true,
    total,
    pageSize: PAGE_SIZE,
    rows: users.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      employeeCode: u.employeeCode,
      companyCode: u.company.code,
      departmentName: u.department?.name ?? null,
      positionName: u.position?.name ?? null,
      enrollmentStatus: u.enrollments[0]?.status ?? null,
      pathState: states.get(u.id) ?? null,
    })),
  };
}

export type ManualPreview =
  | { ok: true; kind: "course"; counts: AssignCounts; selected: number }
  | { ok: true; kind: "path"; path: PathPreview; selected: number }
  | Fail;

export async function previewManualAction(target: Target, selection: Selection, due: DueChoice): Promise<ManualPreview> {
  const actor = await requireRole([...ROLES]);
  const t = await loadTarget(actor, target);
  if ("ok" in t) return t;
  const d = dueSchema.safeParse(due);
  if (!d.success) return { ok: false, message: "Hạn không hợp lệ." };
  const dueDate = dueDateOf(d.data);
  if (typeof dueDate === "string") return { ok: false, message: dueDate };

  const userIds = await resolveUserIds(actor, t, selection);
  if (userIds.length > MAX_IDS) return { ok: false, message: `Mỗi lần giao tối đa ${MAX_IDS.toLocaleString("vi-VN")} người.` };
  if (t.kind === "path") {
    return { ok: true, kind: "path", path: await previewPathAssignment({ learningPathId: t.id, userIds }), selected: userIds.length };
  }
  const counts = await previewAssignment({ courseId: t.id, userIds, due: dueDate });
  return { ok: true, kind: "course", counts, selected: userIds.length };
}

export async function assignManualAction(
  target: Target,
  selection: Selection,
  due: DueChoice,
): Promise<{ ok: true; counts: AssignCounts; newLearners: number } | Fail> {
  const actor = await requireRole([...ROLES]);
  const t = await loadTarget(actor, target);
  if ("ok" in t) return t;
  const d = dueSchema.safeParse(due);
  if (!d.success) return { ok: false, message: "Hạn không hợp lệ." };
  const dueDate = dueDateOf(d.data);
  if (typeof dueDate === "string") return { ok: false, message: dueDate };

  const userIds = await resolveUserIds(actor, t, selection);
  if (userIds.length === 0) return { ok: false, message: "Chưa chọn người học nào (hoặc người đã chọn không còn trong phạm vi)." };
  if (userIds.length > MAX_IDS) return { ok: false, message: `Mỗi lần giao tối đa ${MAX_IDS.toLocaleString("vi-VN")} người.` };

  const common = { userIds, due: dueDate, source: "ASSIGNED" as const, assignedById: actor.id, actorId: actor.id };
  let result: { counts: AssignCounts; newLearners: number };
  if (t.kind === "path") {
    const { newLearners, ...counts } = await assignPath({ ...common, learningPathId: t.id });
    result = { counts, newLearners };
  } else {
    const counts = await assignCourse({ ...common, courseId: t.id });
    result = { counts, newLearners: counts.created + counts.reactivated };
  }
  revalidatePath("/assign/manual");
  revalidatePath("/content/paths");
  return { ok: true, ...result };
}
