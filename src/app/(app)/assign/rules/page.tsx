import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Route, TriangleAlert } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { assignmentRuleScopeWhere } from "@/lib/assignment-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { describeRuleTarget } from "@/lib/rule-describe";
import { getEnumParam, getParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { RuleRowActions } from "./rule-row-actions";

export const metadata: Metadata = { title: "Giao tự động" };

const PATHNAME = "/assign/rules";
const STATUS_VALUES = ["active", "inactive"] as const;

export default async function RulesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const status = getEnumParam(sp, "status", STATUS_VALUES);
  // Quy tắc toàn tập đoàn / nhắm công ty khác chỉ Admin tập đoàn thấy (Việc 29B #3)
  const scope: Prisma.AssignmentRuleWhereInput = assignmentRuleScopeWhere(actor);

  const [courses, paths] = await Promise.all([
    prisma.course.findMany({
      where: { assignmentRules: { some: scope } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true },
    }),
    prisma.learningPath.findMany({
      where: { assignmentRules: { some: scope } },
      orderBy: { code: "asc" },
      select: { id: true, code: true, title: true },
    }),
  ]);
  const courseId = courses.find((c) => c.id === getParam(sp, "course"))?.id;
  const pathId = paths.find((p) => p.id === getParam(sp, "path"))?.id;

  const where: Prisma.AssignmentRuleWhereInput = {
    AND: [
      scope,
      { OR: [{ courseId: { not: null } }, { learningPathId: { not: null } }] },
      ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : []),
      ...(status ? [{ isActive: status === "active" }] : []),
      ...(courseId ? [{ courseId }] : []),
      ...(pathId ? [{ learningPathId: pathId }] : []),
    ],
  };

  const [total, rules] = await prisma.$transaction([
    prisma.assignmentRule.count({ where }),
    prisma.assignmentRule.findMany({
      where,
      orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
      skip,
      take,
      select: {
        id: true,
        name: true,
        dueInDays: true,
        isActive: true,
        includeSubDepartments: true,
        course: { select: { id: true, code: true, title: true, status: true } },
        learningPath: { select: { id: true, code: true, title: true, status: true } },
        targetCompany: { select: { name: true } },
        department: { select: { name: true } },
        position: { select: { name: true } },
        ownerCompany: { select: { code: true } },
        _count: {
          select: {
            enrollments: { where: { status: { not: "CANCELLED" } } },
          },
        },
      },
    }),
  ]);

  // Lượt chưa bắt đầu (để hộp “Tắt quy tắc” nói rõ số lượt có thể bị huỷ) + người tạo (từ nhật ký)
  const ids = rules.map((r) => r.id);
  const [notStarted, created] = await Promise.all([
    prisma.enrollment.groupBy({ by: ["assignmentRuleId"], where: { assignmentRuleId: { in: ids }, status: "NOT_STARTED" }, _count: true }),
    prisma.auditLog.findMany({
      where: { action: "ASSIGNMENT_RULE_CREATED", entityType: "AssignmentRule", entityId: { in: ids } },
      select: { entityId: true, actor: { select: { fullName: true } } },
    }),
  ]);
  const notStartedOf = new Map(notStarted.map((n) => [n.assignmentRuleId, n._count]));
  const creatorOf = new Map(created.map((c) => [c.entityId, c.actor?.fullName ?? null]));

  type Row = (typeof rules)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "name",
      header: "Tên quy tắc",
      cell: (r) => (
        <Link href={`${PATHNAME}/${r.id}`} className="block max-w-64 truncate font-medium text-foreground hover:text-primary" title={r.name}>
          {r.name}
        </Link>
      ),
    },
    {
      key: "course",
      header: "Khoá học / lộ trình",
      cell: (r) =>
        r.learningPath ? (
          <div className="min-w-0 max-w-64">
            <span className="flex items-center gap-1.5 text-foreground" title={r.learningPath.title}>
              <Route className="size-4 shrink-0 text-primary" aria-label="Lộ trình" />
              <span className="truncate">{r.learningPath.title}</span>
            </span>
            {r.learningPath.status !== "PUBLISHED" ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-warning" title="Lộ trình không còn ở trạng thái Đã phát hành — quy tắc tạm không giao cho ai">
                <TriangleAlert className="size-3.5" />
                Lộ trình không còn phát hành — tạm không giao
              </span>
            ) : (
              <span className="text-[13px]">Lộ trình · {r.learningPath.code}</span>
            )}
          </div>
        ) : r.course ? (
          <div className="min-w-0 max-w-64">
            <span className="block truncate text-foreground" title={r.course.title}>
              {r.course.title}
            </span>
            {r.course.status !== "PUBLISHED" ? (
              <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] text-warning" title="Khoá không còn ở trạng thái Đã phát hành — quy tắc tạm không giao cho ai">
                <TriangleAlert className="size-3.5" />
                Khoá không còn phát hành — tạm không giao
              </span>
            ) : (
              <span className="text-[13px]">{r.course.code}</span>
            )}
          </div>
        ) : (
          "—"
        ),
    },
    {
      key: "target",
      header: "Nhóm áp dụng",
      className: "whitespace-normal",
      cell: (r) => (
        <span className="block max-w-80 text-[13px] text-foreground">
          {describeRuleTarget({
            companyName: r.targetCompany?.name ?? null,
            departmentName: r.department?.name ?? null,
            includeSubDepartments: r.includeSubDepartments,
            positionName: r.position?.name ?? null,
          })}
        </span>
      ),
    },
    { key: "due", header: "Hạn", className: "w-24", cell: (r) => (r.dueInDays ? `${r.dueInDays} ngày` : "—") },
    { key: "count", header: "Đang được giao", className: "w-32 text-right", cell: (r) => formatNumber(r._count.enrollments) },
    {
      key: "status",
      header: "Trạng thái",
      className: "w-32",
      cell: (r) => (r.isActive ? <StatusBadge tone="success">Đang chạy</StatusBadge> : <StatusBadge tone="secondary">Đã tắt</StatusBadge>),
    },
    {
      key: "creator",
      header: "Người tạo",
      cell: (r) => (
        <span>
          {creatorOf.get(r.id) ?? "—"}
          {isGroupAdmin && <span className="block text-[13px]">Công ty {r.ownerCompany.code}</span>}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-12 text-right",
      cell: (r) => <RuleRowActions rule={{ id: r.id, name: r.name, isActive: r.isActive, notStarted: notStartedOf.get(r.id) ?? 0 }} />,
    },
  ];

  const addButton = (
    <Link href={`${PATHNAME}/new`} className={buttonVariants()}>
      <Plus />
      Tạo quy tắc
    </Link>
  );

  return (
    <>
      <PageHeader
        title="Giao tự động"
        description="Quy tắc giao khoá học / lộ trình theo công ty / phòng ban / chức danh. Người vào nhóm sau này cũng tự được giao."
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={rules}
        rowKey={(r) => r.id}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm theo tên quy tắc..."
        filters={[
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
          {
            param: "status",
            label: "Trạng thái",
            allLabel: "Tất cả trạng thái",
            options: [
              { value: "active", label: "Đang chạy" },
              { value: "inactive", label: "Đã tắt" },
            ],
          },
        ]}
        toolbar={addButton}
        empty={{
          title: "Chưa có quy tắc nào",
          description: "Tạo quy tắc để tự giao khoá học / lộ trình cho cả một nhóm, kể cả người vào sau.",
          action: addButton,
        }}
      />
    </>
  );
}
