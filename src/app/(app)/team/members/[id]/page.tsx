import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Award, BellRing, BookOpen, ChevronLeft, ExternalLink } from "lucide-react";
import { CertificateActions } from "@/components/certificate-actions";
import { ProgressBar } from "@/components/progress";
import { StatusBadge } from "@/components/status-badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { CERTIFICATE_STATUS, certificateStatus } from "@/lib/certificate-status";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { ENROLLMENT_STATUS_LABELS, isOverdue, SOURCE_LABELS } from "@/lib/enrollment-labels";
import { formatDate } from "@/lib/format";
import { getInitials } from "@/lib/initials";
import { assertUserInTeam } from "@/lib/scope";
import { cn } from "@/lib/utils";
import { RemindDialog } from "../remind-dialog";

export const metadata: Metadata = { title: "Chi tiết nhân viên" };

/** Chi tiết 1 nhân viên trong đội (Việc 26) — chỉ xem + nhắc nhở. Ngoài phạm vi đội → về danh sách. */
export default async function TeamMemberDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const { id } = await params;
  await assertUserInTeam(actor, id);

  const [user, enrollments, certificates, attempts] = await Promise.all([
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
    prisma.enrollment.findMany({
      where: { userId: id, status: { not: "CANCELLED" } },
      orderBy: [{ status: "asc" }, { dueDate: { sort: "asc", nulls: "last" } }],
      select: {
        id: true,
        status: true,
        source: true,
        progressPercent: true,
        dueDate: true,
        completedAt: true,
        acknowledgedVersion: true,
        course: { select: { id: true, code: true, title: true, currentVersion: true } },
        learningPath: { select: { code: true, title: true } },
      },
    }),
    prisma.certificate.findMany({
      where: { userId: id },
      orderBy: { issuedAt: "desc" },
      select: { id: true, code: true, courseTitle: true, courseVersion: true, issuedAt: true, expiresAt: true, revokedAt: true },
    }),
    // Điểm cao nhất từng bài kiểm tra (lượt đã nộp)
    prisma.quizAttempt.groupBy({ by: ["lessonId"], where: { userId: id, submittedAt: { not: null } }, _max: { score: true } }),
  ]);

  const lessons = attempts.length
    ? await prisma.lesson.findMany({
        where: { id: { in: attempts.map((a) => a.lessonId) } },
        select: { id: true, title: true, section: { select: { courseId: true } } },
      })
    : [];
  const scoresByCourse = new Map<string, { title: string; score: number }[]>();
  for (const a of attempts) {
    const l = lessons.find((x) => x.id === a.lessonId);
    if (!l || a._max.score === null) continue;
    const list = scoresByCourse.get(l.section.courseId) ?? [];
    list.push({ title: l.title, score: a._max.score });
    scoresByCourse.set(l.section.courseId, list);
  }

  const now = new Date();
  const isAdmin = actor.role !== "MANAGER";
  const remindButton = (
    <RemindDialog
      selection={{ mode: "ids", ids: [user.id] }}
      targetLabel={user.fullName}
      trigger={
        <Button>
          <BellRing />
          Nhắc nhở
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
        {enrollments.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-muted-foreground">Chưa có khoá học nào.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-y border-border text-left text-[13px] font-medium text-foreground uppercase">
                  <th className="px-6 py-3">Khoá học</th>
                  <th className="px-3 py-3">Nguồn</th>
                  <th className="px-3 py-3">Trạng thái</th>
                  <th className="px-3 py-3">Tiến độ</th>
                  <th className="px-3 py-3">Hạn</th>
                  <th className="px-3 py-3">Phiên bản</th>
                  <th className="px-3 py-3">Điểm kiểm tra cao nhất</th>
                  <th className="px-6 py-3">Hoàn thành</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => {
                  const overdue = isOverdue(e, now);
                  const known = e.acknowledgedVersion ?? 0;
                  const behind = e.status === "COMPLETED" && known < e.course.currentVersion;
                  const scores = scoresByCourse.get(e.course.id) ?? [];
                  return (
                    <tr key={e.id} className="border-b border-border align-top last:border-0">
                      <td className="max-w-72 px-6 py-3">
                        <span className="block truncate font-medium text-foreground" title={e.course.title}>
                          {e.course.title}
                        </span>
                        <span className="text-[13px] text-muted-foreground">
                          {e.course.code}
                          {e.learningPath && <span title={e.learningPath.title}> · Lộ trình {e.learningPath.code}</span>}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={SOURCE_LABELS[e.source].tone}>{SOURCE_LABELS[e.source].label}</StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={ENROLLMENT_STATUS_LABELS[e.status].tone}>{ENROLLMENT_STATUS_LABELS[e.status].label}</StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <ProgressBar value={e.progressPercent} className="w-16" label={`Tiến độ khoá ${e.course.title}`} />
                          <span className="text-[13px] tabular-nums">{e.progressPercent}%</span>
                        </div>
                      </td>
                      <td className={cn("px-3 py-3 whitespace-nowrap", overdue ? "text-destructive" : "text-muted-foreground")}>
                        {e.dueDate ? formatDate(e.dueDate) : "—"}
                        {overdue && <span className="block text-[12px] font-medium">Quá hạn</span>}
                      </td>
                      <td className={cn("px-3 py-3 whitespace-nowrap tabular-nums", behind ? "font-medium text-warning" : "text-muted-foreground")}>
                        {e.course.currentVersion > 0 ? `v${known} / v${e.course.currentVersion}` : "—"}
                        {behind && <span className="block text-[12px]">Chưa nắm bản mới</span>}
                      </td>
                      <td className="px-3 py-3 text-[13px]">
                        {scores.length === 0 ? (
                          <span className="text-foreground/45">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {scores.map((s) => (
                              <li key={s.title} className="flex justify-between gap-3">
                                <span className="max-w-40 truncate text-muted-foreground" title={s.title}>
                                  {s.title}
                                </span>
                                <span className="font-medium text-foreground tabular-nums">{s.score}%</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="px-6 py-3 whitespace-nowrap text-muted-foreground">{e.completedAt ? formatDate(e.completedAt) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="Chứng nhận" icon={<Award className="size-5" />}>
        {certificates.length === 0 ? (
          <p className="py-6 text-center text-[15px] text-muted-foreground">Chưa có chứng nhận.</p>
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
