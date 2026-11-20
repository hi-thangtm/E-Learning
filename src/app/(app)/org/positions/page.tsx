import type { Metadata } from "next";
import { Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { ActiveBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDate, formatNumber } from "@/lib/format";
import { getEnumParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { PositionFormDialog } from "./position-form-dialog";
import { PositionRowActions } from "./position-row-actions";

export const metadata: Metadata = { title: "Chức danh" };

const PATHNAME = "/org/positions";
const STATUS_VALUES = ["active", "inactive"] as const;

export default async function PositionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const canEdit = user.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  const where: Prisma.PositionWhereInput = {
    ...(q && {
      OR: [
        { code: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(status && { isActive: status === "active" }),
  };

  // Chức danh dùng chung toàn tập đoàn, nhưng số nhân viên đếm theo phạm vi quyền:
  // Admin công ty con chỉ đếm nhân viên của công ty mình (docs/database.md — Quy tắc 1).
  const userWhere: Prisma.UserWhereInput = {
    status: "ACTIVE",
    ...(user.role !== "GROUP_ADMIN" && { companyId: user.companyId }),
  };

  const [total, positions] = await prisma.$transaction([
    prisma.position.count({ where }),
    prisma.position.findMany({
      where,
      orderBy: { code: "asc" },
      skip,
      take,
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
        createdAt: true,
        _count: { select: { users: { where: userWhere } } },
      },
    }),
  ]);

  type Row = (typeof positions)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "code",
      header: "Mã",
      className: "w-40",
      cell: (p) => <span className="font-medium text-foreground">{p.code}</span>,
    },
    { key: "name", header: "Tên chức danh", cell: (p) => <span className="text-foreground">{p.name}</span> },
    {
      key: "users",
      header: "Số nhân viên",
      className: "w-36 text-right",
      cell: (p) => formatNumber(p._count.users),
    },
    { key: "status", header: "Trạng thái", className: "w-36", cell: (p) => <ActiveBadge active={p.isActive} /> },
    { key: "createdAt", header: "Ngày tạo", className: "w-36", cell: (p) => formatDate(p.createdAt) },
  ];

  if (canEdit) {
    columns.push({
      key: "actions",
      header: "Thao tác",
      className: "w-28 text-right",
      cell: (p) => (
        <PositionRowActions
          position={{ id: p.id, code: p.code, name: p.name }}
          isActive={p.isActive}
          userCount={p._count.users}
        />
      ),
    });
  }

  const addButton = canEdit ? (
    <PositionFormDialog
      trigger={
        <Button>
          <Plus />
          Thêm chức danh
        </Button>
      }
    />
  ) : null;

  return (
    <>
      <PageHeader
        title="Chức danh"
        description={
          canEdit
            ? "Danh sách chức danh dùng chung toàn tập đoàn."
            : "Danh sách chức danh dùng chung toàn tập đoàn (chỉ Admin tập đoàn được thêm, sửa). Số nhân viên tính trong công ty của bạn."
        }
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={positions}
        rowKey={(p) => p.id}
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
              { value: "active", label: "Đang dùng" },
              { value: "inactive", label: "Đã ẩn" },
            ],
          },
        ]}
        toolbar={addButton}
        empty={{
          title: "Chưa có chức danh nào",
          description: canEdit
            ? "Thêm chức danh để gán cho nhân viên và dùng trong quy tắc giao khoá."
            : "Admin tập đoàn chưa tạo chức danh nào.",
          action: addButton,
        }}
      />
    </>
  );
}
