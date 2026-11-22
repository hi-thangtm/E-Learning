import type { Metadata } from "next";
import { headers } from "next/headers";
import { CircleAlert, CircleCheck, CircleHelp, CircleX } from "lucide-react";
import { CERTIFICATE_STATUS, certificateStatus, type CertificateStatusKey } from "@/lib/certificate-status";
import { parseSnapshot } from "@/lib/certificates";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getClientIp, LIMITS, RATE_LIMIT_MESSAGE, rateLimit } from "@/lib/rate-limit";
import { cn } from "@/lib/utils";
import { VerifyForm } from "../verify-form";

export const metadata: Metadata = { title: "Kết quả tra cứu chứng nhận", robots: { index: false, follow: false } };

const VIEW: Record<CertificateStatusKey | "missing", { title: string; box: string; icon: typeof CircleCheck }> = {
  valid: { title: "Chứng nhận còn hiệu lực", box: "bg-success/16 text-success", icon: CircleCheck },
  expiring: { title: "Chứng nhận còn hiệu lực", box: "bg-success/16 text-success", icon: CircleCheck },
  expired: { title: "Chứng nhận đã hết hạn", box: "bg-warning/16 text-warning", icon: CircleAlert },
  revoked: { title: "Chứng nhận đã bị thu hồi", box: "bg-destructive/16 text-destructive", icon: CircleX },
  missing: { title: "Không tìm thấy chứng nhận", box: "bg-muted text-muted-foreground", icon: CircleHelp },
};

/**
 * Kết quả tra cứu công khai: chỉ thông tin tối thiểu để xác minh — họ tên, khoá + phiên bản, ngày cấp, hạn, công ty cấp.
 * KHÔNG hiện mã nhân viên, phòng ban, điểm.
 */
export default async function VerifyCodePage({ params }: { params: Promise<{ code: string }> }) {
  const code = decodeURIComponent((await params).code).trim().toUpperCase().slice(0, 40);

  // Trang công khai: 30 lần tra cứu / phút / IP (chống dò mã chứng nhận)
  if (!rateLimit(`verify:${getClientIp(await headers())}`, LIMITS.verifyIp).ok) {
    return (
      <div className="space-y-6">
        <p role="alert" className="rounded-md bg-warning/16 px-6 py-5 text-[15px] text-warning">
          {RATE_LIMIT_MESSAGE}
        </p>
        <VerifyForm defaultCode={code} />
      </div>
    );
  }
  const cert = /^[A-Z0-9-]+$/.test(code)
    ? await prisma.certificate.findUnique({
        where: { code },
        select: {
          code: true,
          recipientName: true,
          courseTitle: true,
          courseVersion: true,
          issuedAt: true,
          expiresAt: true,
          revokedAt: true,
          templateSnapshot: true,
          user: { select: { company: { select: { name: true } } } },
        },
      })
    : null;

  const key = cert ? certificateStatus(cert) : "missing";
  const view = VIEW[key];
  const Icon = view.icon;
  const companyName = cert ? (parseSnapshot(cert.templateSnapshot)?.companyName || cert.user.company.name) : null;

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-md bg-card shadow-md">
        <div className={cn("flex items-center gap-4 px-8 py-6", view.box)}>
          <Icon className="size-12 shrink-0" />
          <div>
            <p className="text-2xl font-medium">{view.title}</p>
            <p className="text-[15px] opacity-90">Mã: {code || "—"}</p>
          </div>
        </div>

        {cert ? (
          <dl className="grid grid-cols-2 gap-x-8 gap-y-5 p-8 text-[15px]">
            <div className="col-span-2">
              <dt className="text-[13px] text-muted-foreground">Người nhận</dt>
              <dd className="text-xl font-medium text-foreground">{cert.recipientName}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-[13px] text-muted-foreground">Khoá học</dt>
              <dd className="font-medium text-foreground">
                {cert.courseTitle} <span className="font-normal text-muted-foreground">· phiên bản v{cert.courseVersion}</span>
              </dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Ngày cấp</dt>
              <dd className="font-medium text-foreground">{formatDate(cert.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Hiệu lực</dt>
              <dd className="font-medium text-foreground">{cert.expiresAt ? `Đến ${formatDate(cert.expiresAt)}` : "Không thời hạn"}</dd>
            </div>
            <div>
              <dt className="text-[13px] text-muted-foreground">Trạng thái</dt>
              <dd className="font-medium text-foreground">
                {CERTIFICATE_STATUS[key as CertificateStatusKey].label}
                {cert.revokedAt && ` (ngày ${formatDate(cert.revokedAt)})`}
              </dd>
            </div>
            {companyName && (
              <div>
                <dt className="text-[13px] text-muted-foreground">Đơn vị cấp</dt>
                <dd className="font-medium text-foreground">{companyName}</dd>
              </div>
            )}
          </dl>
        ) : (
          <p className="p-8 text-[15px] text-muted-foreground">
            Không có chứng nhận nào mang mã này. Kiểm tra lại mã (VD: CERT-2026-AB3KZ9) — mã không phân biệt chữ hoa / thường.
          </p>
        )}
      </section>

      <section className="rounded-md bg-card p-6 shadow-md">
        <p className="mb-3 text-[15px] font-medium text-foreground">Tra cứu mã khác</p>
        <VerifyForm />
      </section>
    </div>
  );
}
