import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, BookOpen, ChevronLeft, History, TriangleAlert } from "lucide-react";
import { CertificateActions } from "@/components/certificate-actions";
import { EnrollmentTable } from "@/components/enrollment-table";
import { RoleBadge } from "@/components/role-badge";
import { StatusBadge } from "@/components/status-badge";
import { AuditDetailSheet } from "@/components/audit/audit-detail-sheet";
import { AuditLogTable } from "@/components/audit/audit-log-table";
import { AUDIT_LOG_SELECT, auditScopeWhere, enrichAuditLogs, getAuditLogDetail } from "@/lib/audit-query";
import { CERTIFICATE_STATUS, certificateStatus } from "@/lib/certificate-status";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { getInitials } from "@/lib/initials";
import { getMemberEnrollments } from "@/lib/member-detail";
import { buildHref, getParam, type SearchParams } from "@/lib/table-params";
import { getAncestorIds } from "@/lib/tree";
import { buildUserFormOptions, loadOrgCatalog } from "../form-options";
import { UserActions } from "../user-actions";
import { UserFormOptionsProvider } from "../user-form-options";
import { RevokeCertificateDialog } from "./revoke-certificate-dialog";
import { EmptyState } from "@/components/empty-state";
import { pageTitle } from "@/lib/page-title";
import { LarkBadge } from "@/components/lark-badge";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const { id } = await params;
  const user =
    id && id.length <= 50
      ? await prisma.user.findFirst({
          where: { id, ...(actor.role !== "GROUP_ADMIN" && { companyId: actor.companyId }) },
          select: { fullName: true },
        })
      : null;
  return { title: pageTitle(user?.fullName, "Chi tiết người dùng") };
}

const LOG_LIMIT = 20;

export default async function UserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const { id } = await params;
  if (!id || id.length > 50) redirect("/org/users");

  // Phạm vi ngay trong truy vấn: Admin công ty chỉ xem người công ty mình (chứng nhận tải theo user đã qua kiểm tra này)
  const user = await prisma.user.findFirst({
    where: { id, ...(!isGroupAdmin && { companyId: actor.companyId }) },
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      email: true,
      phone: true,
      role: true,
      status: true,
      hireDate: true,
      createdAt: true,
      lastLoginAt: true,
      lockedUntil: true,
      mustChangePassword: true,
      larkUserId: true,
      passwordSet: true,
      inactiveSource: true,
      companyId: true,
      departmentId: true,
      positionId: true,
      company: { select: { code: true, name: true, isActive: true } },
      position: { select: { name: true } },
      managedDepartments: { select: { code: true, name: true }, orderBy: { code: "asc" } },
    },
  });
  if (!user) redirect("/org/users");

  // Lượt học + chứng nhận của người này (đã qua kiểm tra phạm vi ở trên)
  const [enrollments, certificates] = await Promise.all([
    getMemberEnrollments(user.id),
    prisma.certificate.findMany({
      where: { userId: user.id },
      orderBy: { issuedAt: "desc" },
      select: { id: true, code: true, courseTitle: true, courseVersion: true, issuedAt: true, expiresAt: true, revokedAt: true },
    }),
  ]);

  const sp = await searchParams;
  const pathname = `/org/users/${user.id}`;

  // Nhật ký liên quan: thao tác trên người này, do người này làm, và lần được chỉ định trưởng phòng.
  // Áp cùng phạm vi với trang Nhật ký (Admin công ty chỉ thấy nhật ký của công ty mình).
  const [catalog, rawLogs, logDetail] = await Promise.all([
    loadOrgCatalog(actor),
    prisma.auditLog.findMany({
      where: {
        AND: [
          auditScopeWhere(actor),
          {
            OR: [
              { entityType: "User", entityId: user.id },
              { actorId: user.id },
              { action: "DEPARTMENT_MANAGER_ASSIGNED", metadata: { path: ["managerId"], equals: user.id } },
            ],
          },
        ],
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: LOG_LIMIT,
      select: AUDIT_LOG_SELECT,
    }),
    getAuditLogDetail(actor, getParam(sp, "log")),
  ]);
  const logs = await enrichAuditLogs(actor, rawLogs);

  // Đường dẫn phòng ban: Phòng › Nhóm › Tổ
  const departmentById = new Map(catalog.departments.map((d) => [d.id, d]));
  const departmentPath = user.departmentId
    ? [
        ...getAncestorIds(user.departmentId, new Map(catalog.departments.map((d) => [d.id, d.parentId])))
          .reverse()
          .map((depId) => departmentById.get(depId)?.name),
        departmentById.get(user.departmentId)?.name,
      ]
        .filter(Boolean)
        .join(" › ")
    : null;

  const now = new Date();
  const tempLocked = !!user.lockedUntil && user.lockedUntil > now;
  // Admin công ty không thao tác Admin tập đoàn / Admin công ty khác (trừ chính mình) — Việc 29B #15
  const canEdit = isGroupAdmin || (user.role !== "GROUP_ADMIN" && (user.role !== "COMPANY_ADMIN" || user.id === actor.id));

  return (
    <UserFormOptionsProvider value={buildUserFormOptions(actor, catalog)}>
      <div className="mb-6 space-y-2">
        <Link
          href="/org/users"
          className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Người dùng
        </Link>
        <h1 className="text-2xl font-medium text-foreground">{user.fullName}</h1>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* --- Cột trái: hồ sơ --- */}
        <section className="col-span-4 min-w-0 self-start rounded-md bg-card p-6 shadow-md">
          <div className="flex flex-col items-center gap-4 pt-6 text-center">
            <span
              aria-hidden
              className="flex size-[100px] items-center justify-center rounded-md bg-primary/16 text-[38px] font-medium text-primary"
            >
              {getInitials(user.fullName)}
            </span>
            <div className="space-y-2">
              <p className="text-lg font-medium text-foreground">{user.fullName}</p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <RoleBadge role={user.role} />
                {user.status === "ACTIVE" ? (
                  <StatusBadge tone="success">Đang làm</StatusBadge>
                ) : (
                  <StatusBadge tone="secondary">{user.inactiveSource === "LARK" ? "Đã khoá (Lark)" : "Đã khoá"}</StatusBadge>
                )}
                {user.larkUserId && <LarkBadge />}
                {!user.passwordSet && (
                  <span title="Tạo từ Lark, chưa có mật khẩu — bấm “Đặt lại mật khẩu” để cấp mật khẩu đăng nhập">
                    <StatusBadge tone="warning">Chưa có mật khẩu</StatusBadge>
                  </span>
                )}
              </div>
            </div>
          </div>

          {tempLocked && (
            <p className="mt-4 flex items-center gap-2 rounded-md bg-warning/16 px-3 py-2 text-[13px] text-warning">
              <TriangleAlert className="size-4 shrink-0" />
              Khoá tạm do sai mật khẩu đến {formatDateTime(user.lockedUntil)}
            </p>
          )}
          {!user.company.isActive && (
            <p className="mt-4 flex items-center gap-2 rounded-md bg-warning/16 px-3 py-2 text-[13px] text-warning">
              <TriangleAlert className="size-4 shrink-0" />
              Công ty đang tạm ngưng — người này không đăng nhập được.
            </p>
          )}

          <h2 className="mt-6 border-b border-border pb-3 text-[13px] tracking-[0.4px] text-foreground/45 uppercase">
            Chi tiết
          </h2>
          <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-[15px]">
            <DetailRow label="Mã nhân viên">{user.employeeCode}</DetailRow>
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Điện thoại">{user.phone}</DetailRow>
            <DetailRow label="Công ty">
              {user.company.code} — {user.company.name}
            </DetailRow>
            <DetailRow label="Phòng ban">{departmentPath}</DetailRow>
            <DetailRow label="Chức danh">{user.position?.name}</DetailRow>
            <DetailRow label="Ngày vào làm">{user.hireDate ? formatDate(user.hireDate) : null}</DetailRow>
            <DetailRow label="Tạo lúc">{formatDateTime(user.createdAt)}</DetailRow>
            <DetailRow label="Đăng nhập gần nhất">
              {user.lastLoginAt ? formatDateTime(user.lastLoginAt) : "Chưa đăng nhập"}
            </DetailRow>
            {user.mustChangePassword && (
              <DetailRow label="Mật khẩu">Phải đổi ở lần đăng nhập tới</DetailRow>
            )}
          </dl>

          <h2 className="mt-6 border-b border-border pb-3 text-[13px] tracking-[0.4px] text-foreground/45 uppercase">
            Đang làm trưởng phòng
          </h2>
          {user.managedDepartments.length > 0 ? (
            <ul className="mt-4 space-y-1.5 text-[15px] text-foreground">
              {user.managedDepartments.map((d) => (
                <li key={d.code}>
                  {d.name} <span className="text-muted-foreground">({d.code})</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-[15px] text-foreground/45">Không làm trưởng phòng nào.</p>
          )}

          {canEdit && (
            <div className="mt-6 border-t border-border pt-6">
              <UserActions
                variant="buttons"
                state={{
                  status: user.status,
                  tempLockedUntil: tempLocked && user.lockedUntil ? user.lockedUntil.toISOString() : null,
                  canEdit,
                  isSelf: user.id === actor.id,
                }}
                user={{
                  id: user.id,
                  employeeCode: user.employeeCode,
                  fullName: user.fullName,
                  email: user.email ?? "",
                  phone: user.phone ?? "",
                  companyId: user.companyId,
                  departmentId: user.departmentId ?? "",
                  positionId: user.positionId ?? "",
                  hireDate: user.hireDate ? user.hireDate.toISOString().slice(0, 10) : "",
                  role: user.role,
                  larkLinked: !!user.larkUserId,
                  managedDepartments: user.managedDepartments,
                }}
              />
            </div>
          )}
        </section>

        {/* --- Cột phải --- */}
        <div className="col-span-8 min-w-0 space-y-6">
          <Panel title="Khoá học" icon={<BookOpen className="size-5" />}>
            <EnrollmentTable rows={enrollments} />
          </Panel>

          <Panel title="Chứng nhận" icon={<Award className="size-5" />}>
            {certificates.length === 0 ? (
              <EmptyBlock
                icon={<Award className="size-8" />}
                title="Chưa có chứng nhận"
                description="Chứng nhận được cấp tự động khi người này hoàn thành khoá học có cấp chứng nhận."
              />
            ) : (
              <ul className="divide-y divide-border">
                {certificates.map((c) => {
                  const status = CERTIFICATE_STATUS[certificateStatus(c)];
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
                      <div className="flex items-center gap-2">
                        <CertificateActions certificateId={c.id} code={c.code} showCopy={false} />
                        {!c.revokedAt && <RevokeCertificateDialog certificate={{ id: c.id, code: c.code, courseTitle: c.courseTitle }} />}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>

          <Panel title="Nhật ký gần đây" icon={<History className="size-5" />} subtitle={`${LOG_LIMIT} thao tác mới nhất — bấm một dòng để xem chi tiết`}>
            {logs.length === 0 ? (
              <EmptyBlock
                icon={<History className="size-8" />}
                title="Chưa có nhật ký"
                description="Các thao tác liên quan đến người này sẽ hiện ở đây."
              />
            ) : (
              <AuditLogTable
                rows={logs}
                showCompany={isGroupAdmin}
                rowHref={(log) => buildHref(pathname, sp, { log: log.id })}
              />
            )}
          </Panel>
        </div>
      </div>
      <AuditDetailSheet detail={logDetail} closeHref={buildHref(pathname, sp, { log: null })} />
    </UserFormOptionsProvider>
  );
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-40 shrink-0 font-medium text-foreground">{label}:</dt>
      <dd className="min-w-0 [overflow-wrap:anywhere] text-muted-foreground">{children || <span className="text-foreground/45">—</span>}</dd>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-md bg-card p-6 shadow-md">
      <header className="mb-6 flex items-center gap-3">
        <span className="flex size-[38px] items-center justify-center rounded-md bg-primary/16 text-primary">{icon}</span>
        <div>
          <h2 className="text-lg font-medium text-foreground">{title}</h2>
          {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
        </div>
      </header>
      {children}
    </section>
  );
}

function EmptyBlock({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return (
    <div className="rounded-md border border-dashed border-border">
      <EmptyState iconNode={icon} title={title} description={description} className="py-10" />
    </div>
  );
}
