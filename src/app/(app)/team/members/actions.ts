"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { logAudit } from "@/lib/audit";
import { requireRole, type CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDate, vnIsoDate } from "@/lib/format";
import { notify } from "@/lib/notifications";
import { getTeamScope } from "@/lib/scope";
import { loadMembers, parseMemberQuery } from "./query";
import type { MemberSelection, ReminderMode, ReminderPreview, ReminderResult } from "./types";

/**
 * Nhắc nhở nhân viên (Việc 26) — MANAGER / COMPANY_ADMIN / GROUP_ADMIN, chỉ người trong phạm vi đội (getTeamScope).
 * Mỗi khoá được giao (RULE / ASSIGNED) chưa xong của mỗi người = 1 thông báo REMINDER, chống nhắc trùng trong ngày
 * (dedupeKey reminder:<enrollmentId>:<ngày VN>). Ghi audit TEAM_REMINDER_SENT.
 */

const ROLES = ["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"] as const;
const MAX_IDS = 5000;

const selectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("ids"), ids: z.array(z.string().trim().min(1).max(50)).max(MAX_IDS) }),
  z.object({ mode: z.literal("filter"), params: z.record(z.string(), z.string().max(200)) }),
]);
const modeSchema = z.enum(["overdue", "all"]);
const noteSchema = z
  .string()
  .trim()
  .max(200, "Lời nhắn tối đa 200 ký tự.")
  .transform((v) => v.replace(/\s+/g, " ") || null);

/** Danh sách id người nhận — luôn lọc lại trong phạm vi đội. */
async function resolveUserIds(actor: CurrentUser, selection: MemberSelection): Promise<string[] | null> {
  const parsed = selectionSchema.safeParse(selection);
  if (!parsed.success) return null;
  if (parsed.data.mode === "filter") {
    const { rows } = await loadMembers(actor, parseMemberQuery(parsed.data.params));
    return rows.map((r) => r.id);
  }
  // Theo id: GROUP_ADMIN nhắc được mọi người trong tập đoàn; vai trò khác theo phạm vi của mình
  const scope = await getTeamScope(actor);
  if (scope.empty || parsed.data.ids.length === 0) return [];
  const users = await prisma.user.findMany({ where: { AND: [scope.where, { id: { in: parsed.data.ids } }] }, select: { id: true } });
  return users.map((u) => u.id);
}

function enrollmentWhere(userIds: string[], mode: ReminderMode, now: Date): Prisma.EnrollmentWhereInput {
  return {
    userId: { in: userIds },
    source: { in: ["RULE", "ASSIGNED"] },
    status: { in: ["NOT_STARTED", "IN_PROGRESS"] },
    ...(mode === "overdue" && { dueDate: { lt: now } }),
  };
}

export async function previewReminderAction(selection: MemberSelection, mode: ReminderMode): Promise<ReminderPreview> {
  const actor = await requireRole([...ROLES]);
  const m = modeSchema.safeParse(mode);
  if (!m.success) return { ok: false, message: "Kiểu nhắc không hợp lệ." };
  const userIds = await resolveUserIds(actor, selection);
  if (!userIds) return { ok: false, message: "Danh sách người không hợp lệ." };
  if (userIds.length === 0) return { ok: true, people: 0, notifications: 0 };

  const rows = await prisma.enrollment.groupBy({ by: ["userId"], where: enrollmentWhere(userIds, m.data, new Date()), _count: { _all: true } });
  return { ok: true, people: rows.length, notifications: rows.reduce((s, r) => s + r._count._all, 0) };
}

export async function sendReminderAction(selection: MemberSelection, mode: ReminderMode, note: string): Promise<ReminderResult> {
  const actor = await requireRole([...ROLES]);
  const m = modeSchema.safeParse(mode);
  if (!m.success) return { ok: false, message: "Kiểu nhắc không hợp lệ." };
  const n = noteSchema.safeParse(note ?? "");
  if (!n.success) return { ok: false, message: n.error.issues[0]?.message ?? "Lời nhắn không hợp lệ." };
  const userIds = await resolveUserIds(actor, selection);
  if (!userIds) return { ok: false, message: "Danh sách người không hợp lệ." };
  if (userIds.length === 0) return { ok: false, message: "Chưa chọn nhân viên nào trong phạm vi của bạn." };

  const now = new Date();
  const today = vnIsoDate(now);
  const enrollments = await prisma.enrollment.findMany({
    where: enrollmentWhere(userIds, m.data, now),
    select: { id: true, userId: true, courseId: true, dueDate: true, course: { select: { title: true } } },
  });
  if (enrollments.length === 0) {
    return { ok: false, message: m.data === "overdue" ? "Những người đã chọn không có khoá nào đang quá hạn." : "Những người đã chọn không còn khoá nào chưa hoàn thành." };
  }

  let sent = 0;
  for (let i = 0; i < enrollments.length; i += 500) {
    const batch = enrollments.slice(i, i + 500);
    const results = await prisma.$transaction(
      batch.map((e) =>
        notify(prisma, {
          userIds: [e.userId],
          type: "REMINDER",
          title: `${actor.fullName} nhắc bạn hoàn thành khoá “${e.course.title}”${e.dueDate ? ` (hạn ${formatDate(e.dueDate).slice(0, 5)})` : ""}${
            n.data ? ` — ${n.data}` : ""
          }`,
          link: `/my-courses/${e.courseId}`,
          dedupeKey: `reminder:${e.id}:${today}`,
        }),
      ),
    );
    sent += results.reduce((s, r) => s + r.count, 0);
  }
  const skipped = enrollments.length - sent;
  const people = new Set(enrollments.map((e) => e.userId)).size;

  await logAudit(prisma, {
    actorId: actor.id,
    companyId: actor.companyId,
    action: "TEAM_REMINDER_SENT",
    entityType: "User",
    entityId: userIds.length === 1 ? userIds[0] : null,
    metadata: { mode: m.data, users: people, notifications: sent, skipped, ...(n.data && { note: n.data }) },
  });
  revalidatePath("/team/members");

  return {
    ok: true,
    message:
      sent === 0
        ? `Đã nhắc ${people} người hôm nay rồi — không gửi thêm (${skipped} thông báo trùng).`
        : `Đã gửi ${sent} thông báo nhắc nhở tới ${people} người.${skipped ? ` Bỏ qua ${skipped} khoá đã nhắc hôm nay.` : ""}`,
  };
}
