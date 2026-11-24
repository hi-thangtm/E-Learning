import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Award, BellRing, BookOpen, ChevronLeft, ExternalLink } from "lucide-react";
import { CertificateActions } from "@/components/certificate-actions";
import { EmptyState } from "@/components/empty-state";
import { EnrollmentTable } from "@/components/enrollment-table";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { CERTIFICATE_STATUS, certificateStatus } from "@/lib/certificate-status";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { getInitials } from "@/lib/initials";
import { getMemberEnrollments } from "@/lib/member-detail";
import { assertUserInTeam, isUserInTeam } from "@/lib/scope";
import { RemindDialog } from "../remind-dialog";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const { id } = await params;
  const user = (await isUserInTeam(actor, id)) ? await prisma.user.findUnique({ where: { id }, select: { fullName: true } }) : null;
  return { title: pageTitle(user?.fullName, "Chi tiết nhân viên") };
}

/** Chi tiết 1 nhân viên trong đội (Việc 26) — chỉ xem + nhắc nhở. Ngoài phạm vi đội → về danh sách. */
export default async function TeamMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const { id } = await params;
  await assertUserInTeam(actor, id);

  const [user, enrollments, certificates] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        fullName: true,
        employeeCode: true,
        email: true,
        avatarUrl: true,
        hireDate: true,
        company: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
      },
    }),
    getMemberEnrollments(id),
    prisma.certificate.findMany({
      where: { userId: id },
      orderBy: { issuedAt: "desc" },
      select: { id: true, code: true, courseTitle: true, courseVersion: true, issuedAt: true, expiresAt: true, revokedAt: true },
    }),
  ]);


  const now = new Date();
  const isAdmin = actor.role !== "MANAGER";
  const remindButton = (
    <RemindDialog
      selection={{ mode: "ids", ids: [user.id] }}
      targetLabel={user.fullName}
      trigger={
        <Button>
          <BellRing />
          Gửi nhắc nhở
        </Button>
      }
    />
  );

  return (
    <div className="space-y-6">
      <Link href="/team/members" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ChevronLeft className="size-4" />
        Nhân viên
      </Link>

      <section className="flex flex-wrap items-center justify-between gap-6 rounded-md bg-card p-6 shadow-md">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar className="size-16">
            {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
            <AvatarFallback className="bg-primary/16 text-xl font-medium text-primary">{getInitials(user.fullName)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1">
            <h1 className="text-2xl font-medium text-foreground">{user.fullName}</h1>
            <dl className="flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-muted-foreground">
              <Info label="Mã NV">{user.employeeCode}</Info>
              <Info label="Phòng ban">{user.department?.name}</Info>
              <Info label="Chức danh">{user.position?.name}</Info>
              <Info label="Ngày vào làm">{user.hireDate ? formatDate(user.hireDate) : null}</Info>
              {user.email && <Info label="Email">{user.email}</Info>}
              {actor.role === "GROUP_ADMIN" && <Info label="Công ty">{user.company.name}</Info>}
            </dl>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {isAdmin && (
            <Link href={`/org/users/${user.id}`} className={buttonVariants({ variant: "outline" })}>
              <ExternalLink />
              Mở trong Quản lý người dùng
            </Link>
          )}
          {remindButton}
        </div>
      </section>

      <Panel title="Khoá học" icon={<BookOpen className="size-5" />}>
        <EnrollmentTable rows={enrollments} now={now} />
      </Panel>

      <Panel title="Chứng nhận" icon={<Award className="size-5" />}>
        {certificates.length === 0 ? (
          <EmptyState
            size="sm"
            icon={Award}
            title="Chưa có chứng nhận"
            description="Chứng nhận được cấp tự động khi nhân viên hoàn thành khoá học có cấp chứng nhận."
          />
        ) : (
          <ul className="divide-y divide-border">
            {certificates.map((c) => {
              const status = CERTIFICATE_STATUS[certificateStatus(c, now)];
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[15px] font-medium text-foreground">
                      <span className="truncate">{c.courseTitle}</span>
                      <span className="text-[13px] font-normal text-muted-foreground">v{c.courseVersion}</span>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {c.code} · cấp {formatDate(c.issuedAt)} · {c.expiresAt ? `hiệu lực đến ${formatDate(c.expiresAt)}` : "không thời hạn"}
                      {c.revokedAt && ` · thu hồi ${formatDate(c.revokedAt)}`}
                    </p>
                  </div>
                  <CertificateActions certificateId={c.id} code={c.code} showCopy={false} />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-1">
      <dt>{label}:</dt>
      <dd className="text-foreground">{children || <span className="text-foreground/45">—</span>}</dd>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md bg-card p-6 shadow-md">
      <header className="mb-4 flex items-center gap-3">
        <span className="flex size-[38px] items-center justify-center rounded-md bg-primary/16 text-primary">{icon}</span>
        <h2 className="text-lg font-medium text-foreground">{title}</h2>
      </header>
      {children}
    </section>
  );
}
