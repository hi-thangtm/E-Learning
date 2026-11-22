import "server-only";
import type { ChangeType, Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { dueAfterDays } from "@/lib/format";
import { resetEnrollmentForRelearn } from "@/lib/learning";
import { notify } from "@/lib/notifications";

/**
 * Phát hành bản cập nhật MINOR / MAJOR (Việc 21A) — CHỈ chạy ở server. docs/database.md — Quy tắc 2.
 * - MINOR: người đã học xong chỉ đọc & xác nhận (không đổi lượt học).
 * - MAJOR: người đã học xong phải HỌC LẠI (resetEnrollmentForRelearn); người đang học dở giữ nguyên tiến độ.
 * - Biên soạn chỉ được ĐỀ XUẤT MAJOR; Admin công ty sở hữu / Admin tập đoàn phát hành, duyệt, từ chối.
 */

const BATCH = 500;

type Actor = Pick<CurrentUser, "id" | "role" | "companyId">;
type CourseRef = { ownerCompanyId: string; status: string; currentVersion: number };

// ---------------------------------------------------------------------------------------------
// Quyền (hàm thuần — dùng cả ở trang để ẩn / hiện nút; server action kiểm tra lại)

export function isUpdatable(course: CourseRef): boolean {
  return course.status === "PUBLISHED" && course.currentVersion >= 1;
}

/** MINOR: Biên soạn / Admin công ty của công ty sở hữu, Admin tập đoàn. */
export function canPublishMinor(actor: Actor, course: CourseRef): boolean {
  if (actor.role === "GROUP_ADMIN") return true;
  return (actor.role === "CONTENT_EDITOR" || actor.role === "COMPANY_ADMIN") && actor.companyId === course.ownerCompanyId;
}

/** MAJOR trực tiếp, duyệt, từ chối đề xuất: Admin công ty của công ty sở hữu, Admin tập đoàn. */
export function canManageMajor(actor: Actor, course: CourseRef): boolean {
  if (actor.role === "GROUP_ADMIN") return true;
  return actor.role === "COMPANY_ADMIN" && actor.companyId === course.ownerCompanyId;
}

/** Đề xuất MAJOR: Biên soạn của công ty sở hữu. */
export function canProposeMajor(actor: Actor, course: CourseRef): boolean {
  return actor.role === "CONTENT_EDITOR" && actor.companyId === course.ownerCompanyId;
}

export type VersionResult<T extends object = object> = ({ ok: true } & T) | { ok: false; message: string };

const COURSE_SELECT = { id: true, code: true, title: true, ownerCompanyId: true, status: true, currentVersion: true } as const;

// ---------------------------------------------------------------------------------------------
// Ảnh hưởng

/** Số người bị ảnh hưởng: completed = đã học xong (MINOR: phải xác nhận; MAJOR: phải học lại), inProgress = đang học (giữ tiến độ). */
export async function previewVersionImpact(courseId: string): Promise<{ completed: number; inProgress: number }> {
  const [completed, inProgress] = await prisma.$transaction([
    prisma.enrollment.count({ where: { courseId, status: "COMPLETED" } }),
    prisma.enrollment.count({ where: { courseId, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } }),
  ]);
  return { completed, inProgress };
}

// ---------------------------------------------------------------------------------------------
// Phát hành

function ddMM(date: Date): string {
  const p = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" }).formatToParts(date);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("day")}/${get("month")}`;
}

/** Duyệt lượt học COMPLETED của khoá theo lô 500 (con trỏ id) bên trong transaction. */
async function forEachCompletedBatch(
  tx: Prisma.TransactionClient,
  courseId: string,
  handle: (rows: { id: string; userId: string }[]) => Promise<void>,
): Promise<void> {
  let cursor: string | undefined;
  for (;;) {
    const rows = await tx.enrollment.findMany({
      where: { courseId, status: "COMPLETED" },
      select: { id: true, userId: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) return;
    await handle(rows);
    if (rows.length < BATCH) return;
    cursor = rows[rows.length - 1].id;
  }
}

export async function publishVersion(input: {
  courseId: string;
  changeType: Exclude<ChangeType, "INITIAL">;
  changeSummary: string;
  dueInDays: number;
  actor: Actor;
  fromProposalId?: string;
}): Promise<VersionResult<{ versionNo: number; affected: number }>> {
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: COURSE_SELECT });
  if (!course || !isUpdatable(course)) return { ok: false, message: "Chỉ phát hành bản cập nhật cho khoá đã phát hành (v1 trở lên)." };
  const allowed = input.changeType === "MINOR" ? canPublishMinor(input.actor, course) : canManageMajor(input.actor, course);
  if (!allowed) {
    return {
      ok: false,
      message:
        input.changeType === "MAJOR"
          ? "Chỉ Admin công ty sở hữu khoá hoặc Admin tập đoàn được phát hành bản MAJOR."
          : "Bạn không có quyền phát hành bản cập nhật cho khoá này.",
    };
  }

  const versionNo = course.currentVersion + 1;
  const now = new Date();
  const dueDate = dueAfterDays(input.dueInDays);

  try {
    const outcome = await prisma.$transaction(
      async (tx) => {
        // Chống 2 người phát hành cùng lúc: chỉ tăng khi currentVersion chưa đổi
        const bumped = await tx.course.updateMany({
          where: { id: course.id, status: "PUBLISHED", currentVersion: course.currentVersion },
          data: { currentVersion: versionNo },
        });
        if (bumped.count === 0) throw new Error("VERSION_CHANGED");

        const data = {
          versionNo,
          changeType: input.changeType,
          status: "PUBLISHED" as const,
          changeSummary: input.changeSummary,
          dueInDays: input.dueInDays,
          publishedById: input.actor.id,
          publishedAt: now,
        };
        let versionId: string;
        if (input.fromProposalId) {
          const updated = await tx.courseVersion.updateMany({
            where: { id: input.fromProposalId, courseId: course.id, status: "PROPOSED" },
            data,
          });
          if (updated.count === 0) throw new Error("PROPOSAL_GONE");
          versionId = input.fromProposalId;
        } else {
          versionId = (await tx.courseVersion.create({ data: { courseId: course.id, ...data }, select: { id: true } })).id;
        }

        const affectedIds: string[] = [];
        await forEachCompletedBatch(tx, course.id, async (rows) => {
          if (input.changeType === "MAJOR") {
            for (const e of rows) {
              await resetEnrollmentForRelearn(tx, e.id, { dueDate, reason: "VERSION_MAJOR" });
            }
          }
          await notify(tx, {
            userIds: rows.map((r) => r.userId),
            type: input.changeType === "MAJOR" ? "VERSION_MAJOR" : "VERSION_MINOR",
            title:
              input.changeType === "MAJOR"
                ? `Quy trình “${course.title}” thay đổi lớn — bạn cần học lại trước ${ddMM(dueDate)}`
                : `Quy trình “${course.title}” có cập nhật — vui lòng đọc và xác nhận`,
            link: input.changeType === "MAJOR" ? `/my-courses/${course.id}` : `/my-courses/${course.id}/updates`,
            dedupeKey: `version:${versionId}`,
          });
          affectedIds.push(...rows.map((r) => r.id));
        });

        const inProgress = await tx.enrollment.count({ where: { courseId: course.id, status: { in: ["NOT_STARTED", "IN_PROGRESS"] } } });

        await logAudit(tx, {
          actorId: input.actor.id,
          companyId: course.ownerCompanyId,
          action: "COURSE_VERSION_PUBLISHED",
          entityType: "Course",
          entityId: course.id,
          metadata: {
            code: course.code,
            versionId,
            versionNo,
            changeType: input.changeType,
            affected: affectedIds.length,
            // MAJOR: số người đang học sau khi đặt lại gồm cả người vừa bị đặt lại -> trừ ra
            inProgress: input.changeType === "MAJOR" ? inProgress - affectedIds.length : inProgress,
            dueInDays: input.dueInDays,
            fromProposal: !!input.fromProposalId,
            // Để tab Lịch sử đếm "X / Y người đã xác nhận / học xong lại" (hệ thống < 1.000 người)
            affectedEnrollmentIds: affectedIds,
          },
        });
        return { affected: affectedIds.length };
      },
      { timeout: 120_000, maxWait: 10_000 },
    );
    return { ok: true, versionNo, affected: outcome.affected };
  } catch (error) {
    if (error instanceof Error && error.message === "VERSION_CHANGED") {
      return { ok: false, message: "Khoá vừa được phát hành phiên bản khác — tải lại trang rồi thử lại." };
    }
    if (error instanceof Error && error.message === "PROPOSAL_GONE") {
      return { ok: false, message: "Đề xuất không còn ở trạng thái chờ duyệt." };
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------------
// Đề xuất MAJOR (Biên soạn) — duyệt / từ chối (Admin)

/** Người nhận thông báo đề xuất: Admin công ty sở hữu (khoá của công ty tổng → Admin tập đoàn). */
async function proposalReviewers(ownerCompanyId: string): Promise<string[]> {
  const owner = await prisma.company.findUnique({ where: { id: ownerCompanyId }, select: { parentId: true } });
  const reviewers = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      ...(owner?.parentId === null ? { role: "GROUP_ADMIN" } : { role: "COMPANY_ADMIN", companyId: ownerCompanyId }),
    },
    select: { id: true },
  });
  return reviewers.map((r) => r.id);
}

export async function proposeMajor(input: {
  courseId: string;
  changeSummary: string;
  dueInDays: number;
  actor: Actor;
}): Promise<VersionResult> {
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, select: COURSE_SELECT });
  if (!course || !isUpdatable(course)) return { ok: false, message: "Chỉ đề xuất cho khoá đã phát hành (v1 trở lên)." };
  if (!canProposeMajor(input.actor, course)) return { ok: false, message: "Chỉ Biên soạn của công ty sở hữu khoá mới gửi đề xuất MAJOR." };

  const pending = await prisma.courseVersion.findFirst({ where: { courseId: course.id, status: "PROPOSED" }, select: { id: true } });
  if (pending) return { ok: false, message: "Khoá đang có 1 đề xuất MAJOR chờ duyệt — chờ Admin xử lý xong mới gửi đề xuất mới." };

  const reviewers = await proposalReviewers(course.ownerCompanyId);
  await prisma.$transaction(async (tx) => {
    const version = await tx.courseVersion.create({
      data: {
        courseId: course.id,
        versionNo: null,
        changeType: "MAJOR",
        status: "PROPOSED",
        changeSummary: input.changeSummary,
        dueInDays: input.dueInDays,
        proposedById: input.actor.id,
        proposedAt: new Date(),
      },
      select: { id: true },
    });
    await notify(tx, {
      userIds: reviewers,
      type: "VERSION_PROPOSED",
      title: `Có đề xuất cập nhật MAJOR cho khoá “${course.title}” — cần Admin duyệt`,
      link: `/content/courses/${course.id}?tab=versions`,
      dedupeKey: `proposal:${version.id}`,
    });
    await logAudit(tx, {
      actorId: input.actor.id,
      companyId: course.ownerCompanyId,
      action: "COURSE_VERSION_PROPOSED",
      entityType: "Course",
      entityId: course.id,
      metadata: { code: course.code, versionId: version.id, dueInDays: input.dueInDays },
    });
  });
  return { ok: true };
}

async function loadProposal(versionId: string) {
  return prisma.courseVersion.findFirst({
    where: { id: versionId, status: "PROPOSED" },
    select: { id: true, changeSummary: true, dueInDays: true, proposedById: true, course: { select: COURSE_SELECT } },
  });
}

export async function approveProposal(
  versionId: string,
  actor: Actor,
  options: { dueInDays?: number } = {},
): Promise<VersionResult<{ versionNo: number; affected: number }>> {
  const proposal = await loadProposal(versionId);
  if (!proposal) return { ok: false, message: "Đề xuất không còn ở trạng thái chờ duyệt." };
  if (!canManageMajor(actor, proposal.course)) return { ok: false, message: "Bạn không có quyền duyệt đề xuất này." };
  return publishVersion({
    courseId: proposal.course.id,
    changeType: "MAJOR",
    changeSummary: proposal.changeSummary ?? "",
    dueInDays: options.dueInDays ?? proposal.dueInDays ?? 30,
    actor,
    fromProposalId: proposal.id,
  });
}

export async function rejectProposal(versionId: string, actor: Actor, reviewNote: string): Promise<VersionResult> {
  const proposal = await loadProposal(versionId);
  if (!proposal) return { ok: false, message: "Đề xuất không còn ở trạng thái chờ duyệt." };
  const course = proposal.course;
  if (!canManageMajor(actor, course)) return { ok: false, message: "Bạn không có quyền từ chối đề xuất này." };

  const done = await prisma.$transaction(async (tx) => {
    const updated = await tx.courseVersion.updateMany({
      where: { id: proposal.id, status: "PROPOSED" },
      data: { status: "REJECTED", reviewNote },
    });
    if (updated.count === 0) return false;
    if (proposal.proposedById) {
      await notify(tx, {
        userIds: [proposal.proposedById],
        type: "VERSION_REJECTED",
        title: `Đề xuất cập nhật MAJOR cho khoá “${course.title}” bị từ chối: ${reviewNote.slice(0, 120)}`,
        link: `/content/courses/${course.id}?tab=versions`,
        dedupeKey: `proposal_rejected:${proposal.id}`,
      });
    }
    await logAudit(tx, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "COURSE_VERSION_REJECTED",
      entityType: "Course",
      entityId: course.id,
      metadata: { code: course.code, versionId: proposal.id, reason: reviewNote },
    });
    return true;
  });
  return done ? { ok: true } : { ok: false, message: "Đề xuất không còn ở trạng thái chờ duyệt." };
}
