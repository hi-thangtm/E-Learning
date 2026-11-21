import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { CourseStatusBadge, courseVersionLabel } from "@/components/course-status-badge";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { DataTable, type DataTableColumn, type DataTableFilterConfig } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { canEditCourse, courseVisibleWhere } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getEnumParam, getParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { CourseCreateDialog } from "./course-create-dialog";

export const metadata: Metadata = { title: "Khoá học" };

const PATHNAME = "/content/courses";
const STATUS_VALUES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export default async function CoursesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  const [categories, companies, scope] = await Promise.all([
    prisma.courseCategory.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isActive: true },
    }),
    isGroupAdmin
      ? prisma.company.findMany({
          orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    courseVisibleWhere(actor),
  ]);

  const categoryId = categories.find((c) => c.id === getParam(sp, "category"))?.id;
  const ownerCompanyId = isGroupAdmin ? companies.find((c) => c.id === getParam(sp, "company"))?.id : undefined;

  // Phạm vi (Quy tắc 1) luôn nằm trong câu truy vấn
  const where: Prisma.CourseWhereInput = {
    AND: [
      scope,
      ...(q
        ? [{ OR: [{ title: { contains: q, mode: "insensitive" as const } }, { code: { contains: q, mode: "insensitive" as const } }] }]
        : []),
      ...(categoryId ? [{ categoryId }] : []),
      ...(status ? [{ status }] : []),
      ...(ownerCompanyId ? [{ ownerCompanyId }] : []),
    ],
  };

  const [total, courses] = await prisma.$transaction([
    prisma.course.count({ where }),
    prisma.course.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { code: "asc" }],
      skip,
      take,
      select: {
        id: true,
        code: true,
        title: true,
        thumbnailUrl: true,
        status: true,
        currentVersion: true,
        updatedAt: true,
        ownerCompanyId: true,
        ownerCompany: { select: { code: true, name: true } },
        category: { select: { name: true, isActive: true } },
        _count: { select: { enrollments: { where: { status: { not: "CANCELLED" } } } } },
      },
    }),
  ]);

  type Row = (typeof courses)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "course",
      header: "Khoá học",
      cell: (c) => (
        <div className="flex items-center gap-3">
          <CourseThumbnail thumbnailKey={c.thumbnailUrl} alt="" className="w-16" />
          <div className="min-w-0">
            <p className="max-w-80 truncate font-medium text-foreground" title={c.title}>
              {c.title}
            </p>
            <p className="flex items-center gap-2 text-[13px]">
              {c.code}
              {!canEditCourse(actor, c) && (
                <span className="rounded-sm bg-muted px-1.5 text-[12px] text-muted-foreground">Chỉ xem</span>
              )}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Danh mục",
      cell: (c) =>
        c.category ? (
          <span>
            {c.category.name}
            {!c.category.isActive && <span className="text-foreground/45"> (đã ẩn)</span>}
          </span>
        ) : (
          <span className="text-foreground/45">—</span>
        ),
    },
    {
      key: "owner",
      header: "Công ty sở hữu",
      className: "w-32",
      cell: (c) => <span title={c.ownerCompany.name}>{c.ownerCompany.code}</span>,
    },
    { key: "status", header: "Trạng thái", className: "w-36", cell: (c) => <CourseStatusBadge status={c.status} /> },
    {
      key: "version",
      header: "Phiên bản",
      className: "w-40",
      cell: (c) => <span className={c.currentVersion === 0 ? "text-foreground/45" : ""}>{courseVersionLabel(c.currentVersion)}</span>,
    },
    {
      key: "learners",
      header: "Học viên",
      className: "w-28 text-right",
      cell: (c) => formatNumber(c._count.enrollments),
    },
    { key: "updated", header: "Cập nhật", className: "w-40", cell: (c) => formatDateTime(c.updatedAt) },
  ];

  const filters: DataTableFilterConfig[] = [];
  if (isGroupAdmin) {
    filters.push({
      param: "company",
      label: "Công ty sở hữu",
      allLabel: "Tất cả công ty",
      options: companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    });
  }
  filters.push(
    {
      param: "category",
      label: "Danh mục",
      allLabel: "Tất cả danh mục",
      options: categories.map((c) => ({ value: c.id, label: `${c.name}${c.isActive ? "" : " (đã ẩn)"}` })),
    },
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
  );

  const addButton = (
    <CourseCreateDialog
      categories={categories.filter((c) => c.isActive).map((c) => ({ id: c.id, name: c.name }))}
      companyName={actor.company.name}
      trigger={
        <Button>
          <Plus />
          Tạo khoá học
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Khoá học"
        description={
          isGroupAdmin
            ? "Khoá học của mọi công ty. Bấm một dòng để mở trang soạn."
            : `Khoá học của ${actor.company.name}, kèm khoá đã phát hành của công ty tổng (chỉ xem). Bấm một dòng để mở.`
        }
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={courses}
        rowKey={(c) => c.id}
        rowHref={(c) => `${PATHNAME}/${c.id}`}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm theo tên, mã..."
        filters={filters}
        toolbar={addButton}
        empty={{
          title: "Chưa có khoá học nào",
          description: "Tạo khoá học đầu tiên, sau đó thêm chương và bài ở tab Nội dung.",
          action: addButton,
        }}
      />
    </>
  );
}
