import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/table-params";
import { getAncestorIds, normalizeSearch } from "@/lib/tree";
import { DepartmentTree } from "./department-tree";
import type { DepartmentRow, EmployeeOption } from "./types";

export const metadata: Metadata = { title: "Phòng ban" };

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = user.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const q = getParam(sp, "q").slice(0, 100);

  // Phạm vi (Quy tắc 1): Admin công ty luôn xem công ty mình (bỏ qua ?company).
  // Admin tập đoàn chọn công ty qua ?company, mặc định công ty tổng.
  const companies = isGroupAdmin
    ? await prisma.company.findMany({
        orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
        select: { id: true, code: true, name: true, isActive: true, parentId: true },
      })
    : [];

  let companyId = user.companyId;
  if (isGroupAdmin) {
    const requested = getParam(sp, "company");
    const groupCompany = companies.find((c) => c.parentId === null);
    companyId = companies.find((c) => c.id === requested)?.id ?? groupCompany?.id ?? user.companyId;
  }

  const [departments, employees] = await Promise.all([
    prisma.department.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
      select: {
        id: true,
        parentId: true,
        code: true,
        name: true,
        isActive: true,
        managerId: true,
        manager: { select: { fullName: true, employeeCode: true } },
        _count: { select: { users: { where: { status: "ACTIVE" } } } },
      },
    }),
    prisma.user.findMany({
      where: { companyId, status: "ACTIVE" },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, employeeCode: true, role: true },
    }),
  ]);

  const activeChildren = new Map<string, number>();
  for (const d of departments) {
    if (d.parentId && d.isActive) activeChildren.set(d.parentId, (activeChildren.get(d.parentId) ?? 0) + 1);
  }

  const rows: DepartmentRow[] = departments.map((d) => ({
    id: d.id,
    parentId: d.parentId,
    code: d.code,
    name: d.name,
    isActive: d.isActive,
    managerId: d.managerId,
    managerName: d.manager?.fullName ?? null,
    managerCode: d.manager?.employeeCode ?? null,
    activeUsers: d._count.users,
    activeChildren: activeChildren.get(d.id) ?? 0,
  }));

  // Tìm kiếm: phòng khớp tên / mã (không phân biệt dấu) + toàn bộ phòng cha để hiện đường dẫn
  let matchedIds: string[] | null = null;
  let visibleRows = rows;
  if (q) {
    const needle = normalizeSearch(q);
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
    const matched = rows.filter(
      (r) => normalizeSearch(r.name).includes(needle) || normalizeSearch(r.code).includes(needle),
    );
    const visible = new Set<string>();
    for (const r of matched) {
      visible.add(r.id);
      for (const ancestor of getAncestorIds(r.id, parentOf)) visible.add(ancestor);
    }
    matchedIds = matched.map((r) => r.id);
    visibleRows = rows.filter((r) => visible.has(r.id));
  }

  const employeeOptions: EmployeeOption[] = employees;
  const currentCompany = companies.find((c) => c.id === companyId);

  return (
    <>
      <PageHeader
        title="Phòng ban"
        description={
          isGroupAdmin
            ? "Cây phòng ban của từng công ty (Phòng › Nhóm › Tổ) và trưởng phòng."
            : `Cây phòng ban của ${user.company.name} (Phòng › Nhóm › Tổ) và trưởng phòng.`
        }
      />
      <DepartmentTree
        key={companyId}
        companyId={companyId}
        allRows={rows}
        rows={visibleRows}
        matchedIds={matchedIds}
        employees={employeeOptions}
        companies={
          isGroupAdmin
            ? companies.map((c) => ({
                value: c.id,
                label: `${c.code} — ${c.name}${c.isActive ? "" : " (tạm ngưng)"}`,
              }))
            : null
        }
        companyLabel={currentCompany ? `${currentCompany.code} — ${currentCompany.name}` : user.company.name}
      />
    </>
  );
}
