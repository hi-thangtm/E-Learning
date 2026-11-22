import "server-only";
import { randomInt } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getGroupCompanyId } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { vnIsoDate } from "@/lib/format";
import { notify } from "@/lib/notifications";

/**
 * Chứng nhận (Việc 22) — CHỈ chạy ở server. docs/database.md — Quy tắc 6.
 * - Cấp tự động khi hoàn thành khoá có hasCertificate (onCourseCompleted trong src/lib/learning.ts).
 * - templateSnapshot lưu mẫu tại thời điểm cấp: sửa mẫu sau KHÔNG đổi chứng nhận đã cấp.
 * - Thu hồi: revokedAt (không xoá) + audit.
 */

export type TemplateSnapshot = {
  companyName: string;
  logoKey: string | null;
  signerName: string | null;
  signerTitle: string | null;
  signatureKey: string | null;
};

const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function randomCode(): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return `CERT-${vnIsoDate().slice(0, 4)}-${s}`;
}

/** Cộng N tháng (giữ ngày; tháng ngắn hơn thì lùi về cuối tháng). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Mẫu chứng nhận của 1 công ty: cột nào trống lấy của công ty tổng. companyName = tên công ty đó.
 * Dùng khi cấp (lưu snapshot) và khi xem trước mẫu.
 */
export async function resolveTemplate(db: Db, companyId: string): Promise<TemplateSnapshot> {
  const select = {
    name: true,
    logoUrl: true,
    certificateSignerName: true,
    certificateSignerTitle: true,
    certificateSignatureUrl: true,
  } as const;
  const groupId = await getGroupCompanyId();
  const [company, group] = await Promise.all([
    db.company.findUnique({ where: { id: companyId }, select }),
    groupId && groupId !== companyId ? db.company.findUnique({ where: { id: groupId }, select }) : Promise.resolve(null),
  ]);
  return {
    companyName: company?.name ?? group?.name ?? "",
    logoKey: company?.logoUrl || group?.logoUrl || null,
    signerName: company?.certificateSignerName || group?.certificateSignerName || null,
    signerTitle: company?.certificateSignerTitle || group?.certificateSignerTitle || null,
    signatureKey: company?.certificateSignatureUrl || group?.certificateSignatureUrl || null,
  };
}

/** Đọc templateSnapshot an toàn. */
export function parseSnapshot(value: Prisma.JsonValue | null): TemplateSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const str = (x: unknown) => (typeof x === "string" && x ? x : null);
  return {
    companyName: str(v.companyName) ?? "",
    logoKey: str(v.logoKey),
    signerName: str(v.signerName),
    signerTitle: str(v.signerTitle),
    signatureKey: str(v.signatureKey),
  };
}

/**
 * Cấp chứng nhận cho 1 lượt học đã hoàn thành (gọi TRONG transaction hoàn thành khoá).
 * Khoá không cấp chứng nhận → null. Đã có chứng nhận cho lần hoàn thành này → trả id cũ, created = false (không cấp trùng).
 */
export async function issueCertificate(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
): Promise<{ id: string; created: boolean } | null> {
  const e = await tx.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      userId: true,
      completedVersion: true,
      completedAt: true,
      user: { select: { fullName: true, companyId: true } },
      course: { select: { id: true, title: true, hasCertificate: true, certificateValidMonths: true, currentVersion: true } },
    },
  });
  if (!e || !e.course.hasCertificate) return null;

  const courseVersion = e.completedVersion ?? e.course.currentVersion;
  const issuedAt = e.completedAt ?? new Date();
  // Đã cấp cho CHÍNH lần hoàn thành này (cùng phiên bản, cấp từ lúc hoàn thành trở đi) → dùng lại, kể cả đã thu hồi
  // (thu hồi không bị cấp lại tự động). Học lại sau khi chứng nhận hết hạn = lần hoàn thành mới → cấp chứng nhận mới.
  const existing = await tx.certificate.findFirst({
    where: { userId: e.userId, courseId: e.course.id, courseVersion, issuedAt: { gte: new Date(issuedAt.getTime() - 1000) } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  let code = randomCode();
  for (let i = 0; i < 10 && (await tx.certificate.findUnique({ where: { code }, select: { id: true } })); i++) {
    code = randomCode();
  }

  const snapshot = await resolveTemplate(tx, e.user.companyId);
  const certificate = await tx.certificate.create({
    data: {
      code,
      userId: e.userId,
      courseId: e.course.id,
      courseVersion,
      recipientName: e.user.fullName,
      courseTitle: e.course.title,
      issuedAt,
      expiresAt: e.course.certificateValidMonths ? addMonths(issuedAt, e.course.certificateValidMonths) : null,
      templateSnapshot: snapshot,
    },
    select: { id: true },
  });

  await notify(tx, {
    userIds: [e.userId],
    type: "CERTIFICATE_ISSUED",
    title: `Chúc mừng! Bạn đã nhận chứng nhận hoàn thành khoá “${e.course.title}”`,
    link: "/certificates",
    dedupeKey: `cert_issued:${certificate.id}`,
  });
  return { id: certificate.id, created: true };
}

// ---------------------------------------------------------------------------------------------
// Quyền

type Actor = Pick<CurrentUser, "id" | "role" | "companyId">;

/** Tải PDF: chủ chứng nhận, Admin công ty cùng công ty người nhận, Admin tập đoàn. */
export function canDownloadCertificate(actor: Actor, cert: { userId: string; user: { companyId: string } }): boolean {
  if (actor.id === cert.userId || actor.role === "GROUP_ADMIN") return true;
  return actor.role === "COMPANY_ADMIN" && actor.companyId === cert.user.companyId;
}

/** Thu hồi: Admin công ty (người công ty mình), Admin tập đoàn. */
export function canRevokeCertificate(actor: Actor, cert: { user: { companyId: string } }): boolean {
  if (actor.role === "GROUP_ADMIN") return true;
  return actor.role === "COMPANY_ADMIN" && actor.companyId === cert.user.companyId;
}

export async function revokeCertificate(
  certificateId: string,
  actor: Actor,
  reason: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const cert = await prisma.certificate.findUnique({
    where: { id: certificateId },
    select: {
      id: true,
      code: true,
      revokedAt: true,
      recipientName: true,
      courseTitle: true,
      user: { select: { companyId: true, employeeCode: true } },
    },
  });
  if (!cert || !canRevokeCertificate(actor, cert)) return { ok: false, message: "Không tìm thấy chứng nhận hoặc bạn không có quyền." };
  if (cert.revokedAt) return { ok: false, message: "Chứng nhận này đã bị thu hồi trước đó." };

  await prisma.$transaction([
    prisma.certificate.update({ where: { id: cert.id }, data: { revokedAt: new Date() } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: cert.user.companyId,
      action: "CERTIFICATE_REVOKED",
      entityType: "Certificate",
      entityId: cert.id,
      metadata: {
        code: cert.code,
        reason,
        learnerName: `${cert.recipientName} (${cert.user.employeeCode})`,
        courseTitle: cert.courseTitle,
      },
    }),
  ]);
  return { ok: true };
}
