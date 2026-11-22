import { resolveTemplate } from "@/lib/certificates";
import { pdfResponse, renderCertificatePdf } from "@/lib/certificate-pdf";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";

/**
 * Xem trước mẫu chứng nhận với dữ liệu mẫu: GET /system/certificate-templates/preview?company=<id>
 * Dùng mẫu ĐANG LƯU của công ty (cột trống lấy của công ty tổng). Admin công ty luôn xem công ty mình.
 */
export async function GET(request: Request) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const requested = new URL(request.url).searchParams.get("company") ?? "";
  const companyId = actor.role === "GROUP_ADMIN" ? requested : actor.companyId;
  const company = companyId ? await prisma.company.findUnique({ where: { id: companyId.slice(0, 50) }, select: { id: true } }) : null;
  if (!company) {
    return new Response("Không tìm thấy công ty.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const now = new Date();
  const pdf = await renderCertificatePdf({
    code: "CERT-MAU-XEMTRUOC",
    recipientName: "Nguyễn Văn A",
    courseTitle: "Khoá học mẫu — Quy trình an toàn lao động",
    courseVersion: 1,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 365 * 86_400_000),
    revoked: false,
    snapshot: await resolveTemplate(prisma, company.id),
  });
  return pdfResponse(pdf, "ChungNhan_XemTruoc.pdf", true);
}
