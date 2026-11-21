"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { assignCourse, previewAssignment, type AssignCounts } from "@/lib/assignment";
import {
  activeLearnerWhere,
  assignableCoursesWhere,
  departmentWithChildren,
  learnerCompaniesForCourse,
} from "@/lib/assignment-scope";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { dueAfterDays, vnDayEnd, vnIsoDate } from "@/lib/format";
import type { DueChoice, LearnerFilter, LearnerRow, Selection } from "./types";

/**
 * Trình giao khoá thủ công. Mọi action: requireRole -> khoá phải PUBLISHED trong phạm vi ->
 * người học phải trong phạm vi khoá (khoá công ty con: chỉ công ty đó; Admin công ty: chỉ công ty mình).
 * “Chọn tất cả theo bộ lọc”: trình duyệt gửi BỘ LỌC, server tự tìm danh sách người.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN"] as const;
const PAGE_SIZE = 20;
const MAX_IDS = 5000;

const id = z.string().trim().max(50);
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

async function loadCourse(actor: CurrentUser, courseId: string) {
  if (!courseId || courseId.length > 50) return null;
  return prisma.course.findFirst({
    where: { AND: [await assignableCoursesWhere(actor), { id: courseId }] },
    select: { id: true, code: true, title: true, ownerCompanyId: true },
  });
}

async function learnerWhere(actor: CurrentUser, course: { ownerCompanyId: string }, f: z.infer<typeof filterSchema>) {
  const companies = await learnerCompaniesForCourse(actor, course);
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

/** Danh sách id người được chọn — luôn lọc lại theo phạm vi khoá ở server. */
async function resolveUserIds(actor: CurrentUser, course: { ownerCompanyId: string }, selection: Selection): Promise<string[]> {
  const parsed = selectionSchema.parse(selection);
  const where =
    parsed.mode === "filter"
      ? await learnerWhere(actor, course, parsed.filter)
      : { AND: [await learnerWhere(actor, course, filterSchema.parse({})), { id: { in: parsed.ids } }] };
  const rows = await prisma.user.findMany({ where, select: { id: true }, take: MAX_IDS + 1 });
  return rows.map((r) => r.id);
}

export async function searchLearnersAction(
  courseId: string,
  filter: LearnerFilter,
  page: number,
): Promise<{ ok: true; rows: LearnerRow[]; total: number; pageSize: number } | Fail> {
  const actor = await requireRole([...ROLES]);
  const course = await loadCourse(actor, courseId);
  if (!course) return { ok: false, message: "Khoá học không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn." };
  const f = filterSchema.safeParse(filter);
  if (!f.success) return { ok: false, message: "Bộ lọc không hợp lệ." };

  const where = await learnerWhere(actor, course, f.data);
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
        enrollments: { where: { courseId: course.id }, select: { status: true } },
      },
    }),
  ]);

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
    })),
  };
}

export async function previewManualAction(
  courseId: string,
  selection: Selection,
  due: DueChoice,
): Promise<{ ok: true; counts: AssignCounts; selected: number } | Fail> {
  const actor = await requireRole([...ROLES]);
  const course = await loadCourse(actor, courseId);
  if (!course) return { ok: false, message: "Khoá học không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn." };
  const d = dueSchema.safeParse(due);
  if (!d.success) return { ok: false, message: "Hạn không hợp lệ." };
  const dueDate = dueDateOf(d.data);
  if (typeof dueDate === "string") return { ok: false, message: dueDate };

  const userIds = await resolveUserIds(actor, course, selection);
  if (userIds.length > MAX_IDS) return { ok: false, message: `Mỗi lần giao tối đa ${MAX_IDS.toLocaleString("vi-VN")} người.` };
  const counts = await previewAssignment({ courseId: course.id, userIds, due: dueDate });
  return { ok: true, counts, selected: userIds.length };
}

export async function assignManualAction(
  courseId: string,
  selection: Selection,
  due: DueChoice,
): Promise<{ ok: true; counts: AssignCounts } | Fail> {
  const actor = await requireRole([...ROLES]);
  const course = await loadCourse(actor, courseId);
  if (!course) return { ok: false, message: "Khoá học không tồn tại, chưa phát hành hoặc ngoài phạm vi của bạn." };
  const d = dueSchema.safeParse(due);
  if (!d.success) return { ok: false, message: "Hạn không hợp lệ." };
  const dueDate = dueDateOf(d.data);
  if (typeof dueDate === "string") return { ok: false, message: dueDate };

  const userIds = await resolveUserIds(actor, course, selection);
  if (userIds.length === 0) return { ok: false, message: "Chưa chọn người học nào (hoặc người đã chọn không còn trong phạm vi)." };
  if (userIds.length > MAX_IDS) return { ok: false, message: `Mỗi lần giao tối đa ${MAX_IDS.toLocaleString("vi-VN")} người.` };

  const counts = await assignCourse({
    courseId: course.id,
    userIds,
    due: dueDate,
    source: "ASSIGNED",
    assignedById: actor.id,
    actorId: actor.id,
  });
  revalidatePath("/assign/manual");
  return { ok: true, counts };
}
