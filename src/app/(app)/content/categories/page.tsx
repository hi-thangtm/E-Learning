import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { getEnumParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { CategoryFormDialog } from "./category-form-dialog";
import { CategoryRowActions } from "./category-row-actions";

export const metadata: Metadata = { title: "Danh mục khoá học" };

const PATHNAME = "/content/categories";
const STATUS_VALUES = ["active", "inactive"] as const;
const ORDER_BY: Prisma.CourseCategoryOrderByWithRelationInput[] = [{ sortOrder: "asc" }, { name: "asc" }];

export default async function CategoriesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const canEdit = user.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  const where: Prisma.CourseCategoryWhereInput = {
    ...(q && { name: { contains: q, mode: "insensitive" } }),
    ...(status && { isActive: status === "active" }),
  };

  // Danh mục dùng chung, nhưng số khoá học đếm theo phạm vi quyền (docs/database.md — Quy tắc 1):
  // Admin công ty / Biên soạn thấy khoá của công ty mình + khoá đã phát hành của công ty tổng.
  let courseWhere: Prisma.CourseWhereInput = {};
  if (!canEdit) {
    const groupCompany = await prisma.company.findFirst({ where: { parentId: null }, select: { id: true } });
    courseWhere = {
      OR: [
        { ownerCompanyId: user.companyId },
        ...(groupCompany && groupCompany.id !== user.companyId
          ? [{ ownerCompanyId: groupCompany.id, status: "PUBLISHED" as const }]
          : []),
      ],
    };
  }

  const [total, categories, first, last] = await prisma.$transaction([
    prisma.courseCategory.count({ where }),
    prisma.courseCategory.findMany({
      where,
      orderBy: ORDER_BY,
      skip,
      take,
      select: {
        id: true,
        name: true,
        sortOrder: true,
        isActive: true,
        _count: { select: { courses: { where: courseWhere } } },
      },
    }),
    // Đầu / cuối theo thứ tự toàn bộ (để khoá nút mũi tên đúng chỗ dù đang lọc hay phân trang)
    prisma.courseCategory.findFirst({ orderBy: ORDER_BY, select: { id: true } }),
    prisma.courseCategory.findFirst({
      orderBy: [{ sortOrder: "desc" }, { name: "desc" }],
      select: { id: true },
    }),
  ]);

  type Row = (typeof categories)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "sortOrder",
      header: "Thứ tự",
      className: "w-24 text-right tabular-nums",
      cell: (c) => c.sortOrder,
    },
    { key: "name", header: "Tên danh mục", cell: (c) => <span className="font-medium text-foreground">{c.name}</span> },
    {
      key: "courses",
      header: "Số khoá học",
      className: "w-36 text-right",
      cell: (c) => formatNumber(c._count.courses),
    },
    { key: "status", header: "Trạng thái", className: "w-36", cell: (c) => <ActiveBadge active={c.isActive} /> },
  ];

  if (canEdit) {
    columns.push({
      key: "actions",
      header: "Thao tác",
      className: "w-48 text-right",
      cell: (c) => (
        <CategoryRowActions
          category={{ id: c.id, name: c.name, sortOrder: c.sortOrder }}
          isActive={c.isActive}
          courseCount={c._count.courses}
          isFirst={c.id === first?.id}
          isLast={c.id === last?.id}
        />
      ),
    });
  }

  const addButton = canEdit ? (
    <CategoryFormDialog
      trigger={
        <Button>
          <Plus />
          Thêm danh mục
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Danh mục khoá học"
        description={
          canEdit
            ? "Danh mục dùng chung toàn tập đoàn để phân loại khoá học. Danh mục đã ẩn không chọn được cho khoá học mới."
            : "Danh mục dùng chung toàn tập đoàn (chỉ Admin tập đoàn được thêm, sửa). Số khoá học tính trong phạm vi công ty của bạn."
        }
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={categories}
        rowKey={(c) => c.id}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm theo tên..."
        filters={[
          {
            param: "status",
            label: "Trạng thái",
            allLabel: "Tất cả trạng thái",
            options: [
              { value: "active", label: "Đang dùng" },
              { value: "inactive", label: "Đã ẩn" },
            ],
          },
        ]}
        toolbar={addButton}
        empty={{
          title: "Chưa có danh mục nào",
          description: canEdit
            ? "Thêm danh mục để phân loại khoá học."
            : "Admin tập đoàn chưa tạo danh mục khoá học nào.",
          action: addButton,
        }}
      />
    </>
  );
}
