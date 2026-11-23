import type { Metadata } from "next";
import Link from "next/link";
import { Award } from "lucide-react";
import { CertificateActions } from "@/components/certificate-actions";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { CERTIFICATE_STATUS, certificateStatus } from "@/lib/certificate-status";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Chứng nhận" };

/** Chứng nhận của tôi (feature-spec 2.9) — chỉ chứng nhận của chính người đăng nhập. */
export default async function MyCertificatesPage() {
  const user = await requireUser();
  const certificates = await prisma.certificate.findMany({
    where: { userId: user.id },
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      code: true,
      courseTitle: true,
      courseVersion: true,
      issuedAt: true,
      expiresAt: true,
      revokedAt: true,
      courseId: true,
    },
  });
  const now = new Date();

  return (
    <>
      <PageHeader title="Chứng nhận" description="Chứng nhận hoàn thành khoá học của bạn. Mỗi chứng nhận có mã số và link tra cứu công khai." />

      {certificates.length === 0 ? (
        <EmptyState
          icon={Award}
          title="Bạn chưa có chứng nhận nào"
          description="Hoàn thành các khoá học có cấp chứng nhận để nhận chứng nhận tại đây."
          className="rounded-md bg-card shadow-md"
          action={
            <Link href="/my-courses" className={buttonVariants({ variant: "secondary" })}>
              Mở Khoá học của tôi
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {certificates.map((c) => {
            const status = CERTIFICATE_STATUS[certificateStatus(c, now)];
            const inactive = !!c.revokedAt || (c.expiresAt !== null && c.expiresAt <= now);
            return (
              <article
                key={c.id}
                className={cn("flex flex-col gap-4 rounded-md border bg-card p-5", inactive ? "border-border opacity-80" : "border-warning/40")}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-warning/16 text-warning">
                    <Award className="size-6" />
                  </span>
                  <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                </div>
                <div className="min-w-0">
                  <h2 className="line-clamp-2 text-lg leading-normal break-words font-medium text-foreground" title={c.courseTitle}>
                    {c.courseTitle}
                  </h2>
                  <p className="text-[13px] text-muted-foreground">Phiên bản v{c.courseVersion}</p>
                </div>
                <dl className="grid grid-cols-2 gap-3 border-t border-border pt-4 text-[13px]">
                  <div className="col-span-2">
                    <dt className="text-muted-foreground">Mã chứng nhận</dt>
                    <dd className="font-medium text-foreground tabular-nums">{c.code}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Ngày cấp</dt>
                    <dd className="font-medium text-foreground">{formatDate(c.issuedAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Hiệu lực đến</dt>
                    <dd className="font-medium text-foreground">{c.expiresAt ? formatDate(c.expiresAt) : "Không thời hạn"}</dd>
                  </div>
                  {c.revokedAt && (
                    <div className="col-span-2 text-destructive">Đã thu hồi ngày {formatDate(c.revokedAt)}</div>
                  )}
                </dl>
                <div className="mt-auto">
                  <CertificateActions certificateId={c.id} code={c.code} />
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
