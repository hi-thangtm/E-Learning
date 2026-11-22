import { canDownloadCertificate, parseSnapshot, resolveTemplate } from "@/lib/certificates";
import { certificateFileName, pdfResponse, renderCertificatePdf } from "@/lib/certificate-pdf";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isUserInTeam } from "@/lib/scope";

/**
 * Tải PDF chứng nhận: GET /api/certificates/<id>/pdf
 * Quyền: chủ chứng nhận, Admin công ty (người công ty mình), Admin tập đoàn, Trưởng phòng (người trong đội — Việc 26). Đã thu hồi → vẫn tải được, có chữ chìm "ĐÃ THU HỒI".
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return text("Bạn cần đăng nhập để tải chứng nhận.", 401);

  const { id } = await ctx.params;
  if (!id || id.length > 50) return text("Không tìm thấy chứng nhận.", 404);

  const cert = await prisma.certificate.findUnique({
    where: { id },
    select: {
      code: true,
      userId: true,
      recipientName: true,
      courseTitle: true,
      courseVersion: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      templateSnapshot: true,
      course: { select: { code: true } },
      user: { select: { companyId: true, employeeCode: true } },
    },
  });
  if (!cert) return text("Không tìm thấy chứng nhận.", 404);
  const allowed = canDownloadCertificate(user, cert) || (user.role === "MANAGER" && (await isUserInTeam(user, cert.userId)));
  if (!allowed) return text("Bạn không có quyền tải chứng nhận này.", 403);

  // Chứng nhận cấp trước khi có snapshot (dữ liệu cũ) → dùng mẫu hiện tại của công ty người nhận
  const snapshot = parseSnapshot(cert.templateSnapshot) ?? (await resolveTemplate(prisma, cert.user.companyId));
  const pdf = await renderCertificatePdf({
    code: cert.code,
    recipientName: cert.recipientName,
    courseTitle: cert.courseTitle,
    courseVersion: cert.courseVersion,
    issuedAt: cert.issuedAt,
    expiresAt: cert.expiresAt,
    revoked: !!cert.revokedAt,
    snapshot,
  });
  return pdfResponse(pdf, certificateFileName(cert.course?.code ?? null, cert.user.employeeCode));
}

function text(message: string, status: number) {
  return new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}
