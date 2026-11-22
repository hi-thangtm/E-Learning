"use server";

import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { vnIsoDate } from "@/lib/format";
import { notify } from "@/lib/notifications";
import { courseLearners, parseReportFilters, resolveReportContext } from "@/lib/reports";
import type { ActionState } from "@/lib/action-state";

/**
 * “Nhắc xác nhận” (Việc 27 — tab Nắm quy trình mới nhất): người trong phạm vi đội đã hoàn thành khoá nhưng chưa xác nhận
 * bản MINOR mới nhất (theo ĐÚNG bộ lọc báo cáo đang xem) → 1 thông báo REMINDER / người, link trang “Có gì thay đổi”, chống nhắc trùng trong ngày.
 * Người đang học lại do MAJOR không nằm trong nhóm này (họ cần học, không cần xác nhận).
 */
export async function remindAcknowledgeAction(courseId: string, filterParams: Record<string, string>): Promise<ActionState> {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  if (!courseId || courseId.length > 50) return { message: "Khoá học không hợp lệ." };
  const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, currentVersion: true } });
  if (!course || course.currentVersion < 2) return { message: "Khoá học không có bản cập nhật để xác nhận." };

  // Người trong phạm vi đội + bộ lọc báo cáo (lọc lại ở server, không tin dữ liệu trình duyệt)
  const params = Object.fromEntries(Object.entries(filterParams ?? {}).filter(([k, v]) => typeof k === "string" && typeof v === "string").slice(0, 20));
  const ctx = await resolveReportContext(actor, parseReportFilters(params));
  if (ctx.scope.empty) return { message: "Bạn không có nhân viên nào trong phạm vi." };
  const learners = await courseLearners(ctx, course.id, "unacknowledged");
  const userIds = (learners?.rows ?? []).filter((r) => r.ackState === "unconfirmed").map((r) => r.userId);
  const enrollments = userIds.length
    ? await prisma.enrollment.findMany({
        where: { courseId: course.id, userId: { in: userIds }, status: "COMPLETED" },
        select: { id: true, userId: true },
      })
    : [];
  if (enrollments.length === 0) return { message: "Không còn ai cần xác nhận bản cập nhật của khoá này." };

  const today = vnIsoDate();
  const title = `${actor.fullName} nhắc bạn xác nhận bản cập nhật khoá ${course.title} (v${course.currentVersion})`;
  let sent = 0;
  for (let i = 0; i < enrollments.length; i += 500) {
    const results = await prisma.$transaction(
      enrollments.slice(i, i + 500).map((e) =>
        notify(prisma, {
          userIds: [e.userId],
          type: "REMINDER",
          title,
          link: `/my-courses/${course.id}/updates`,
          dedupeKey: `reminder_ack:${e.id}:${today}`,
        }),
      ),
    );
    sent += results.reduce((s, r) => s + r.count, 0);
  }
  const skipped = enrollments.length - sent;

  await logAudit(prisma, {
    actorId: actor.id,
    companyId: actor.companyId,
    action: "TEAM_REMINDER_SENT",
    entityType: "Course",
    entityId: course.id,
    metadata: { mode: "ack", courseCode: course.code, users: enrollments.length, notifications: sent, skipped },
  });
  revalidatePath("/reports");

  return {
    ok: true,
    message:
      sent === 0
        ? `Đã nhắc ${enrollments.length} người hôm nay rồi — không gửi thêm.`
        : `Đã nhắc ${sent} người xác nhận bản cập nhật.${skipped ? ` Bỏ qua ${skipped} người đã nhắc hôm nay.` : ""}`,
  };
}
