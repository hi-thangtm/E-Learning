import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { getEnumParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { CompanyFormDialog } from "./company-form-dialog";
import { CompanyRowActions } from "./company-row-actions";

export const metadata: Metadata = { title: "Công ty con" };

const PATHNAME = "/system/companies";
const STATUS_VALUES = ["active", "inactive"] as const;

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["GROUP_ADMIN"]);

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  const where: Prisma.CompanyWhereInput = {
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(status && { isActive: status === "active" }),
  };

  const [total, companies] = await prisma.$transaction([
    prisma.company.count({ where }),
    prisma.company.findMany({
      where,
      // Công ty tổng (parentId = NULL) luôn ở dòng đầu
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        isActive: true,
        _count: {
          select: {
            users: { where: { status: "ACTIVE" } },
            departments: { where: { isActive: true } },
          },
        },
        users: {
          where: { role: "COMPANY_ADMIN", status: "ACTIVE" },
          select: { id: true, fullName: true, employeeCode: true },
          orderBy: { fullName: "asc" },
        },
      },
    }),
  ]);

  type Row = (typeof companies)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "code",
      header: "Mã",
      className: "w-32",
      cell: (c) => <span className="font-medium text-foreground">{c.code}</span>,
    },
    {
      key: "name",
      header: "Tên công ty",
      truncate: true,
      truncateText: (c) => c.name,
      cell: (c) => <span className="text-foreground">{c.name}</span>,
    },
    {
      key: "type",
      header: "Loại",
      className: "w-36",
      cell: (c) =>
        c.parentId === null ? (
          <StatusBadge tone="primary">Công ty tổng</StatusBadge>
        ) : (
          <StatusBadge tone="info">Công ty con</StatusBadge>
        ),
    },
    {
      key: "users",
      header: "Số nhân viên",
      className: "w-32 text-right",
      cell: (c) => formatNumber(c._count.users),
    },
    {
      key: "departments",
      header: "Số phòng ban",
      className: "w-32 text-right",
      cell: (c) => formatNumber(c._count.departments),
    },
    {
      key: "admins",
      header: "Admin công ty",
      className: "max-w-64 whitespace-normal",
      cell: (c) =>
        c.users.length > 0 ? (
          <span title={c.users.map((u) => `${u.fullName} (${u.employeeCode})`).join(", ")}>
            {c.users.map((u) => u.fullName).join(", ")}
          </span>
        ) : (
          <span className="text-foreground/45">—</span>
        ),
    },
    {
      key: "status",
      header: "Trạng thái",
      className: "w-32",
      cell: (c) =>
        c.isActive ? (
          <StatusBadge tone="success">Hoạt động</StatusBadge>
        ) : (
          <StatusBadge tone="secondary">Tạm ngưng</StatusBadge>
        ),
    },
    {
      key: "actions",
      header: "Thao tác",
      className: "w-28 text-right",
      cell: (c) => (
        <CompanyRowActions
          company={{ id: c.id, code: c.code, name: c.name, isGroup: c.parentId === null }}
          isActive={c.isActive}
          activeUsers={c._count.users}
        />
      ),
    },
  ];

  const addButton = (
    <CompanyFormDialog
      trigger={
        <Button>
          <Plus />
          Thêm công ty con
        </Button>
      }
    />
  );

  return (
    <>
      <PageHeader
        title="Công ty con"
        description="Quản lý công ty tổng và các công ty con, chỉ định admin cho từng công ty."
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={companies}
        rowKey={(c) => c.id}
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
              { value: "active", label: "Hoạt động" },
              { value: "inactive", label: "Tạm ngưng" },
            ],
          },
        ]}
        toolbar={addButton}
        empty={{
          title: "Chưa có công ty nào",
          description: "Thêm công ty con để bắt đầu quản lý nhân viên theo từng công ty.",
          action: addButton,
        }}
      />
    </>
  );
}
