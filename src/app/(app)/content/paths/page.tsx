import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { CourseStatusBadge } from "@/components/course-status-badge";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import { canEditPath, pathVisibleWhere } from "@/lib/path-scope";
import { getEnumParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { PathCreateDialog } from "./path-create-dialog";

export const metadata: Metadata = { title: "Lộ trình học" };

const PATHNAME = "/content/paths";
const STATUS_VALUES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

/** Danh sách lộ trình (feature-spec 4.6) — phạm vi như khoá học. */
export default async function PathsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  const where: Prisma.LearningPathWhereInput = {
    AND: [
      await pathVisibleWhere(actor),
      ...(q
        ? [{ OR: [{ code: { contains: q, mode: "insensitive" as const } }, { title: { contains: q, mode: "insensitive" as const } }] }]
        : []),
      ...(status ? [{ status }] : []),
    ],
  };

  const [total, paths] = await prisma.$transaction([
    prisma.learningPath.count({ where }),
    prisma.learningPath.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { code: "asc" }],
      skip,
      take,
      select: {
        id: true,
        code: true,
        title: true,
        status: true,
        updatedAt: true,
        ownerCompanyId: true,
        ownerCompany: { select: { code: true, name: true } },
        _count: { select: { courses: true } },
      },
    }),
  ]);

  // Số người đang được giao lộ trình (người khác nhau có lượt học chưa huỷ gắn lộ trình)
  const learnerRows = paths.length
    ? await prisma.enrollment.findMany({
        where: { learningPathId: { in: paths.map((p) => p.id) }, status: { not: "CANCELLED" } },
        select: { learningPathId: true, userId: true },
        distinct: ["learningPathId", "userId"],
      })
    : [];
  const learners = new Map<string, number>();
  for (const r of learnerRows) learners.set(r.learningPathId!, (learners.get(r.learningPathId!) ?? 0) + 1);

  type Row = (typeof paths)[number];
  const columns: DataTableColumn<Row>[] = [
    { key: "code", header: "Mã", className: "w-36", cell: (p) => <span className="font-medium text-foreground">{p.code}</span> },
    {
      key: "title",
      header: "Tên lộ trình",
      cell: (p) => (
        <span className="flex items-center gap-2">
          <span className="max-w-96 truncate text-foreground" title={p.title}>
            {p.title}
          </span>
          {!canEditPath(actor, p) && (
            <span className="inline-flex shrink-0 items-center rounded-sm bg-muted px-1.5 text-[12px] whitespace-nowrap text-muted-foreground">
              Chỉ xem
            </span>
          )}
        </span>
      ),
    },
    { key: "courses", header: "Số khoá", className: "w-24 text-right", cell: (p) => formatNumber(p._count.courses) },
    { key: "owner", header: "Công ty sở hữu", className: "w-32", cell: (p) => <span title={p.ownerCompany.name}>{p.ownerCompany.code}</span> },
    { key: "status", header: "Trạng thái", className: "w-36", cell: (p) => <CourseStatusBadge status={p.status} /> },
    { key: "learners", header: "Đang được giao", className: "w-32 text-right", cell: (p) => formatNumber(learners.get(p.id) ?? 0) },
    { key: "updated", header: "Cập nhật", className: "w-40", cell: (p) => formatDateTime(p.updatedAt) },
  ];

  const addButton = (
    <PathCreateDialog
      companyName={actor.company.name}
      trigger={
        <Button>
          <Plus />
          Tạo lộ trình
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader title="Lộ trình học" description="Chuỗi khoá học theo thứ tự — học xong khoá trước mới mở khoá sau." />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={paths}
        rowKey={(p) => p.id}
        rowHref={(p) => `${PATHNAME}/${p.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm theo mã, tên..."
        filters={[
          {
            param: "status",
            label: "Trạng thái",
            allLabel: "Tất cả trạng thái",
            options: [
              { value: "DRAFT", label: "Nháp" },
              { value: "PUBLISHED", label: "Đã phát hành" },
              { value: "ARCHIVED", label: "Lưu trữ" },
            ],
          },
        ]}
        toolbar={addButton}
        empty={{ title: "Chưa có lộ trình nào", description: "Tạo lộ trình để giao nhiều khoá học theo thứ tự.", action: addButton }}
      />
    </>
  );
}
