import type { Metadata } from "next";
import Link from "next/link";
import { FileSpreadsheet, Plus, TriangleAlert } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn, type DataTableFilterConfig } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getInitials } from "@/lib/initials";
import { ROLE_LABELS } from "@/lib/roles";
import { getEnumParam, getParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { buildChildrenMap, flattenTree, getDescendantIds } from "@/lib/tree";
import { buildUserFormOptions, loadOrgCatalog, ROLE_ORDER } from "./form-options";
import { UserFormDialog } from "./user-form-dialog";
import { UserFormOptionsProvider } from "./user-form-options";
import { UserActions } from "./user-actions";
import { LarkBadge } from "@/components/lark-badge";

export const metadata: Metadata = { title: "Người dùng" };

const PATHNAME = "/org/users";
const STATUS_VALUES = ["active", "inactive"] as const;

export default async function UsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = user.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const role = getEnumParam(sp, "role", ROLE_ORDER);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  // --- Danh mục trong phạm vi (Quy tắc 1): Admin công ty chỉ công ty mình ---
  const catalog = await loadOrgCatalog(user);
  const { companies, departments, positions } = catalog;

  // Công ty đang xem: Admin công ty luôn công ty mình (bỏ qua ?company); Admin tập đoàn tuỳ ?company
  const requestedCompany = getParam(sp, "company");
  const scopeCompanyId = isGroupAdmin
    ? companies.find((c) => c.id === requestedCompany)?.id
    : user.companyId;

  // Lọc phòng ban: gồm cả phòng con / cháu. Phòng phải thuộc công ty đang xem.
  const scopeDepartments = scopeCompanyId ? departments.filter((d) => d.companyId === scopeCompanyId) : [];
  const requestedDepartment = getParam(sp, "department");
  const department = scopeDepartments.find((d) => d.id === requestedDepartment);
  const departmentIds = department
    ? [department.id, ...getDescendantIds(department.id, buildChildrenMap(scopeDepartments))]
    : null;

  const positionId = positions.find((p) => p.id === getParam(sp, "position"))?.id;

  const where: Prisma.UserWhereInput = {
    ...(scopeCompanyId && { companyId: scopeCompanyId }),
    ...(q && {
      OR: [
        { employeeCode: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ],
    }),
    ...(departmentIds && { departmentId: { in: departmentIds } }),
    ...(positionId && { positionId }),
    ...(role && { role }),
    ...(status && { status: status === "active" ? "ACTIVE" : "INACTIVE" }),
  };

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: [{ fullName: "asc" }, { employeeCode: "asc" }],
      skip,
      take,
      select: {
        id: true,
        employeeCode: true,
        fullName: true,
        email: true,
        phone: true,
        role: true,
        status: true,
        lastLoginAt: true,
        lockedUntil: true,
        hireDate: true,
        companyId: true,
        departmentId: true,
        positionId: true,
        larkUserId: true,
        company: { select: { code: true, name: true } },
        department: { select: { code: true, name: true } },
        position: { select: { name: true } },
        managedDepartments: { select: { code: true, name: true }, orderBy: { code: "asc" } },
      },
    }),
  ]);

  type Row = (typeof users)[number];

  const formOptions = buildUserFormOptions(user, catalog, scopeCompanyId);
  const now = new Date();

  const columns: DataTableColumn<Row>[] = [
    {
      key: "user",
      header: "Người dùng",
      cell: (u) => (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="flex size-[34px] shrink-0 items-center justify-center rounded-full bg-primary/16 text-[13px] font-medium text-primary"
          >
            {getInitials(u.fullName)}
          </span>
          <div className="min-w-0">
            <span className="flex max-w-64 items-center gap-2">
              <Link
                href={`${PATHNAME}/${u.id}`}
                title={u.fullName}
                className="block min-w-0 truncate rounded-sm font-medium text-foreground hover:text-primary focus-visible:text-primary"
              >
                {u.fullName}
              </Link>
              {u.larkUserId && <LarkBadge />}
            </span>
            <p className="max-w-56 truncate text-[13px]" title={u.email ?? undefined}>{u.email ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      key: "code",
      header: "Mã NV",
      className: "w-32",
      cell: (u) => (
        <span className="block">
          <span className="text-foreground">{u.employeeCode}</span>
          {/* Công ty gộp vào dòng phụ (bảng gọn — ui-review #51) */}
          {isGroupAdmin && (
            <span className="block text-[13px]" title={u.company.name}>
              {u.company.code}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "org",
      header: "Phòng ban / Chức danh",
      cell: (u) => (
        <span className="block max-w-56">
          <span className="block truncate text-foreground" title={u.department?.name}>
            {u.department?.name ?? <span className="text-foreground/45">—</span>}
          </span>
          <span className="block truncate text-[13px]" title={u.position?.name}>
            {u.position?.name ?? "—"}
          </span>
        </span>
      ),
    },
    {
      key: "role",
      header: "Vai trò",
      className: "w-40",
      cell: (u) => <RoleBadge role={u.role} />,
    },
    {
      key: "status",
      header: "Trạng thái",
      className: "w-40",
      cell: (u) => (
        <div className="flex items-center gap-2">
          {u.status === "ACTIVE" ? (
            <StatusBadge tone="success">Đang làm</StatusBadge>
          ) : (
            <StatusBadge tone="secondary">Đã khoá</StatusBadge>
          )}
          {u.lockedUntil && u.lockedUntil > now && (
            <span
              title={`Khoá tạm do sai mật khẩu đến ${formatDateTime(u.lockedUntil)}`}
              className="inline-flex text-warning"
            >
              <TriangleAlert className="size-[18px]" aria-hidden />
              <span className="sr-only">Khoá tạm do sai mật khẩu đến {formatDateTime(u.lockedUntil)}</span>
            </span>
          )}
        </div>
      ),
    },
    {
      key: "lastLogin",
      header: "Đăng nhập gần nhất",
      className: "w-44",
      cell: (u) =>
        u.lastLoginAt ? formatDateTime(u.lastLoginAt) : <span className="text-foreground/45">Chưa đăng nhập</span>,
    },
    {
      key: "actions",
      header: "Thao tác",
      className: "text-right",
      sticky: true,
      cell: (u) => (
        <UserActions
          variant="menu"
          state={{
            status: u.status,
            tempLockedUntil: u.lockedUntil && u.lockedUntil > now ? u.lockedUntil.toISOString() : null,
            // Admin công ty không thao tác Admin tập đoàn / Admin công ty khác (trừ chính mình) — Việc 29B #15
            canEdit: isGroupAdmin || (u.role !== "GROUP_ADMIN" && (u.role !== "COMPANY_ADMIN" || u.id === user.id)),
            isSelf: u.id === user.id,
          }}
          user={{
            id: u.id,
            employeeCode: u.employeeCode,
            fullName: u.fullName,
            email: u.email ?? "",
            phone: u.phone ?? "",
            companyId: u.companyId,
            departmentId: u.departmentId ?? "",
            positionId: u.positionId ?? "",
            hireDate: u.hireDate ? u.hireDate.toISOString().slice(0, 10) : "",
            role: u.role,
            larkLinked: !!u.larkUserId,
            managedDepartments: u.managedDepartments,
          }}
        />
      ),
    },
  ];

  const filters: DataTableFilterConfig[] = [];
  if (isGroupAdmin) {
    filters.push({
      param: "company",
      label: "Công ty",
      allLabel: "Tất cả công ty",
      options: companies.map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}${c.isActive ? "" : " (tạm ngưng)"}`,
      })),
    });
  }
  if (scopeCompanyId) {
    filters.push({
      param: "department",
      label: "Phòng ban",
      allLabel: "Tất cả phòng ban",
      options: flattenTree(scopeDepartments, "all").map(({ row, depth }) => ({
        value: row.id,
        label: `${"   ".repeat(depth)}${row.name}${row.isActive ? "" : " (đã ẩn)"}`,
      })),
    });
  }
  filters.push(
    {
      param: "position",
      label: "Chức danh",
      allLabel: "Tất cả chức danh",
      options: positions.map((p) => ({ value: p.id, label: `${p.name}${p.isActive ? "" : " (đã ẩn)"}` })),
    },
    {
      param: "role",
      label: "Vai trò",
      allLabel: "Tất cả vai trò",
      options: ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABELS[r] })),
    },
    {
      param: "status",
      label: "Trạng thái",
      allLabel: "Tất cả trạng thái",
      options: [
        { value: "active", label: "Đang làm" },
        { value: "inactive", label: "Đã khoá" },
      ],
    },
  );

  const addButton = (
    <UserFormDialog
      trigger={
        <Button>
          <Plus />
          Thêm người dùng
        </Button>
      }
    />
  );

  return (
    <UserFormOptionsProvider value={formOptions}>
      <PageHeader
        title="Người dùng"
        description={
          isGroupAdmin
            ? "Tài khoản nhân viên của toàn tập đoàn: thông tin, phòng ban, chức danh và vai trò."
            : `Tài khoản nhân viên của ${user.company.name}: thông tin, phòng ban, chức danh và vai trò.`
        }
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={columns}
        rows={users}
        rowKey={(u) => u.id}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm theo mã, tên, email..."
        filters={filters}
        toolbar={
          <>
            <Link
              href={scopeCompanyId && isGroupAdmin ? `${PATHNAME}/import?company=${scopeCompanyId}` : `${PATHNAME}/import`}
              className={buttonVariants({ variant: "outline" })}
            >
              <FileSpreadsheet />
              Import nhân viên
            </Link>
            {addButton}
          </>
        }
        empty={{
          title: "Chưa có người dùng nào",
          description: "Thêm nhân viên để bắt đầu giao khoá học.",
          action: addButton,
        }}
      />
    </UserFormOptionsProvider>
  );
}
