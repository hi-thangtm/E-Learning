import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { EnrollmentSource, EnrollmentStatus, Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn, type DataTableFilterConfig } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { enrollmentScopeWhere } from "@/lib/assignment-scope";
import { courseVisibleWhere } from "@/lib/course-scope";
import { pathVisibleWhere } from "@/lib/path-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { ENROLLMENT_STATUS_LABELS, isOverdue, SOURCE_LABELS } from "@/lib/enrollment-labels";
import { formatDate, vnIsoDate } from "@/lib/format";
import { getEnumParam, getParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { buildChildrenMap, flattenTree, getDescendantIds } from "@/lib/tree";
import { EnrollmentRowActions } from "./enrollment-row-actions";

export const metadata: Metadata = { title: "Danh sách giao khoá" };

const PATHNAME = "/assign/manual";
const SOURCES = ["RULE", "ASSIGNED", "SELF"] as const satisfies readonly EnrollmentSource[];
const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const satisfies readonly EnrollmentStatus[];

export default async function EnrollmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const source = getEnumParam(sp, "source", SOURCES);
  const status = getEnumParam(sp, "status", STATUSES);
  const overdueOnly = getParam(sp, "due") === "overdue";

  const [companies, courses, paths] = await Promise.all([
    prisma.company.findMany({
      where: isGroupAdmin ? {} : { id: actor.companyId },
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      select: { id: true, code: true, name: true },
    }),
    // Lọc khoá: các khoá có lượt giao xem được
    prisma.course.findMany({
      where: { AND: [await courseVisibleWhere(actor), { enrollments: { some: enrollmentScopeWhere(actor) } }] },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true },
    }),
    // Lọc lộ trình: các lộ trình có lượt giao xem được
    prisma.learningPath.findMany({
      where: { AND: [await pathVisibleWhere(actor), { enrollments: { some: enrollmentScopeWhere(actor) } }] },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true },
    }),
  ]);

  const companyId = isGroupAdmin ? companies.find((c) => c.id === getParam(sp, "company"))?.id : actor.companyId;
  const courseId = courses.find((c) => c.id === getParam(sp, "course"))?.id;
  const pathId = paths.find((p) => p.id === getParam(sp, "path"))?.id;

  // Phòng ban (gồm phòng con) — chỉ khi đã xác định công ty
  const departments = companyId
    ? await prisma.department.findMany({
        where: { companyId },
        orderBy: { code: "asc" },
        select: { id: true, parentId: true, name: true, isActive: true },
      })
    : [];
  const department = departments.find((d) => d.id === getParam(sp, "department"));
  const departmentIds = department ? [department.id, ...getDescendantIds(department.id, buildChildrenMap(departments))] : null;

  const now = new Date();
  const where: Prisma.EnrollmentWhereInput = {
    AND: [
      enrollmentScopeWhere(actor),
      ...(companyId ? [{ user: { companyId } }] : []),
      ...(departmentIds ? [{ user: { departmentId: { in: departmentIds } } }] : []),
      ...(courseId ? [{ courseId }] : []),
      ...(pathId ? [{ learningPathId: pathId }] : []),
      ...(source ? [{ source }] : []),
      ...(status ? [{ status }] : []),
      ...(overdueOnly ? [{ dueDate: { lt: now }, status: { in: ["NOT_STARTED", "IN_PROGRESS"] as EnrollmentStatus[] } }] : []),
      ...(q
        ? [
            {
              user: {
                OR: [
                  { fullName: { contains: q, mode: "insensitive" as const } },
                  { employeeCode: { contains: q, mode: "insensitive" as const } },
                ],
              },
            },
          ]
        : []),
    ],
  };

  const [total, rows] = await prisma.$transaction([
    prisma.enrollment.count({ where }),
    prisma.enrollment.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take,
      select: {
        id: true,
        status: true,
        source: true,
        progressPercent: true,
        dueDate: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            company: { select: { code: true, name: true } },
            department: { select: { name: true } },
          },
        },
        course: { select: { id: true, code: true, title: true } },
        learningPath: { select: { id: true, code: true, title: true } },
        assignedBy: { select: { fullName: true } },
        assignmentRule: { select: { name: true, isActive: true } },
      },
    }),
  ]);

  type Row = (typeof rows)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "learner",
      header: "Người học",
      cell: (e) => (
        <div className="min-w-0">
          <Link href={`/org/users/${e.user.id}`} className="block truncate font-medium text-foreground hover:text-primary">
            {e.user.fullName}
          </Link>
          <p className="text-[13px]">{e.user.employeeCode}</p>
        </div>
      ),
    },
    ...(isGroupAdmin
      ? [{ key: "company", header: "Công ty", className: "w-24", cell: (e: Row) => <span title={e.user.company.name}>{e.user.company.code}</span> }]
      : []),
    {
      key: "department",
      header: "Phòng ban",
      cell: (e) => e.user.department?.name ?? <span className="text-foreground/45">—</span>,
    },
    {
      key: "course",
      header: "Khoá học",
      cell: (e) => (
        <Link href={`/content/courses/${e.course.id}`} className="block max-w-64 truncate text-foreground hover:text-primary" title={e.course.title}>
          {e.course.title}
          <span className="block text-[13px] text-muted-foreground">{e.course.code}</span>
        </Link>
      ),
    },
    {
      key: "path",
      header: "Lộ trình",
      className: "w-32",
      cell: (e) =>
        e.learningPath ? (
          <Link
            href={`/content/paths/${e.learningPath.id}`}
            className="block max-w-32 truncate text-foreground hover:text-primary"
            title={e.learningPath.title}
          >
            {e.learningPath.code}
          </Link>
        ) : (
          <span className="text-foreground/45">—</span>
        ),
    },
    {
      key: "source",
      header: "Cách giao",
      className: "w-32",
      cell: (e) => (
        <span title={e.assignmentRule ? `Quy tắc: ${e.assignmentRule.name}` : undefined}>
          <StatusBadge tone={SOURCE_LABELS[e.source].tone}>{SOURCE_LABELS[e.source].label}</StatusBadge>
        </span>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      className: "w-36",
      cell: (e) => <StatusBadge tone={ENROLLMENT_STATUS_LABELS[e.status].tone}>{ENROLLMENT_STATUS_LABELS[e.status].label}</StatusBadge>,
    },
    {
      key: "progress",
      header: "Tiến độ",
      className: "w-32",
      cell: (e) => (
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-primary" style={{ width: `${e.progressPercent}%` }} />
          </div>
          <span className="text-[13px] tabular-nums">{e.progressPercent}%</span>
        </div>
      ),
    },
    {
      key: "due",
      header: "Hạn",
      className: "w-32",
      cell: (e) =>
        !e.dueDate ? (
          <span className="text-foreground/45">—</span>
        ) : isOverdue(e, now) ? (
          <span className="text-destructive">
            {formatDate(e.dueDate)}
            <span className="block text-[12px] font-medium">Quá hạn</span>
          </span>
        ) : (
          formatDate(e.dueDate)
        ),
    },
    {
      key: "assignedBy",
      header: "Người giao",
      cell: (e) =>
        e.assignedBy?.fullName ?? <span className="text-foreground/45 italic">{e.source === "RULE" ? "Hệ thống" : "—"}</span>,
    },
    { key: "createdAt", header: "Ngày giao", className: "w-28", cell: (e) => formatDate(e.createdAt) },
    {
      key: "actions",
      header: "",
      className: "w-12 text-right",
      cell: (e) => {
        const open = e.status !== "COMPLETED" && e.status !== "CANCELLED";
        const lockedByRule = open && e.source === "RULE" && !!e.assignmentRule?.isActive;
        return (
          <EnrollmentRowActions
            enrollment={{
              id: e.id,
              learner: `${e.user.fullName} (${e.user.employeeCode})`,
              course: e.course.title,
              dueDate: e.dueDate ? vnIsoDate(e.dueDate) : "",
              canExtend: open,
              canCancel: open && !lockedByRule,
              canGrantAttempts: e.status !== "CANCELLED",
              lockedByRule,
            }}
          />
        );
      },
    },
  ];

  const filters: DataTableFilterConfig[] = [
    {
      param: "course",
      label: "Khoá học",
      allLabel: "Tất cả khoá học",
      options: courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.title}` })),
    },
    ...(paths.length
      ? [
          {
            param: "path",
            label: "Lộ trình",
            allLabel: "Tất cả lộ trình",
            options: paths.map((p) => ({ value: p.id, label: `${p.code} — ${p.title}` })),
          },
        ]
      : []),
  ];
  if (isGroupAdmin) {
    filters.push({
      param: "company",
      label: "Công ty",
      allLabel: "Tất cả công ty",
      options: companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    });
  }
  if (companyId) {
    filters.push({
      param: "department",
      label: "Phòng ban",
      allLabel: "Tất cả phòng ban",
      options: flattenTree(departments, "all").map(({ row, depth }) => ({
        value: row.id,
        label: `${"   ".repeat(depth)}${row.name}${row.isActive ? "" : " (đã ẩn)"}`,
      })),
    });
  }
  filters.push(
    {
      param: "source",
      label: "Cách giao",
      allLabel: "Mọi cách giao",
      options: SOURCES.map((s) => ({ value: s, label: SOURCE_LABELS[s].label })),
    },
    {
      param: "status",
      label: "Trạng thái",
      allLabel: "Tất cả trạng thái",
      options: STATUSES.map((s) => ({ value: s, label: ENROLLMENT_STATUS_LABELS[s].label })),
    },
    {
      param: "due",
      label: "Hạn",
      allLabel: "Mọi hạn",
      options: [{ value: "overdue", label: "Chỉ quá hạn" }],
    },
  );

  const assignButton = (
    <Link href={`${PATHNAME}/new`} className={buttonVariants()}>
      <Plus />
      Giao khoá học / lộ trình
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Danh sách giao khoá"
        description={
          isGroupAdmin
            ? "Các lượt giao khoá học cho nhân viên toàn tập đoàn: thủ công, tự động theo quy tắc và tự đăng ký."
            : `Các lượt giao khoá học cho nhân viên ${actor.company.name}.`
        }
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={rows}
        rowKey={(e) => e.id}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm người học (tên, mã NV)..."
        filters={filters}
        toolbar={assignButton}
        empty={{
          title: "Chưa có lượt giao nào",
          description: "Giao khoá học / lộ trình cho nhân viên thủ công, hoặc tạo quy tắc giao tự động.",
          action: assignButton,
        }}
      />
    </>
  );
}
