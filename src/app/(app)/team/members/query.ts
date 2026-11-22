import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getTeamScope, type TeamScope } from "@/lib/scope";
import { getParam, type SearchParams } from "@/lib/table-params";
import { getMemberRows, type MemberRow } from "@/lib/team-stats";
import { buildChildrenMap, flattenTree, getDescendantIds } from "@/lib/tree";

/**
 * Bộ lọc + sắp xếp danh sách Nhân viên (dùng chung: trang, xuất Excel, nhắc nhở “theo bộ lọc”).
 * Mọi thứ đều lọc lại trong phạm vi getTeamScope — không tin id / bộ lọc từ trình duyệt.
 */

export const SORT_KEYS = ["name", "assigned", "completed", "inProgress", "overdue", "unacknowledged", "rate"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type MemberQuery = {
  q: string;
  company: string;
  department: string;
  overdue: boolean;
  unack: boolean;
  sort: SortKey;
  dir: "asc" | "desc";
};

export function parseMemberQuery(sp: SearchParams): MemberQuery {
  const sort = getParam(sp, "sort");
  return {
    q: getParam(sp, "q").trim().slice(0, 100),
    company: getParam(sp, "company").slice(0, 50),
    department: getParam(sp, "department").slice(0, 50),
    overdue: getParam(sp, "overdue") === "1",
    unack: getParam(sp, "unack") === "1",
    sort: (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : "name",
    dir: getParam(sp, "dir") === "desc" ? "desc" : "asc",
  };
}

export type DepartmentOption = { value: string; label: string };

/** Phạm vi + phòng ban chọn được (trong phạm vi) + danh sách người đã lọc / sắp xếp. */
export async function loadMembers(actor: CurrentUser, query: MemberQuery) {
  // GROUP_ADMIN chọn công ty; vai trò khác: getTeamScope tự giới hạn
  const company =
    actor.role === "GROUP_ADMIN" && query.company
      ? await prisma.company.findUnique({ where: { id: query.company }, select: { id: true } })
      : null;
  const scope: TeamScope = await getTeamScope(actor, { companyId: company?.id ?? null });

  // Phòng ban chọn được: MANAGER = phòng trong phạm vi; admin = phòng của công ty đang xem
  const departments = scope.empty
    ? []
    : await prisma.department.findMany({
        where: scope.departmentIds ? { id: { in: scope.departmentIds } } : scope.companyId ? { companyId: scope.companyId } : { id: { in: [] } },
        orderBy: { code: "asc" },
        select: { id: true, parentId: true, name: true, isActive: true },
      });
  const departmentOptions: DepartmentOption[] = flattenTree(departments, "all").map(({ row, depth }) => ({
    value: row.id,
    label: `${"   ".repeat(depth)}${row.name}${row.isActive ? "" : " (đã ẩn)"}`,
  }));
  const department = departments.find((d) => d.id === query.department);
  const departmentIds = department ? [department.id, ...getDescendantIds(department.id, buildChildrenMap(departments))] : null;

  const extra: Prisma.UserWhereInput[] = [
    ...(query.q
      ? [{ OR: [{ fullName: { contains: query.q, mode: "insensitive" as const } }, { employeeCode: { contains: query.q, mode: "insensitive" as const } }] }]
      : []),
    ...(departmentIds ? [{ departmentId: { in: departmentIds } }] : []),
  ];
  let rows = await getMemberRows(scope, extra);
  if (query.overdue) rows = rows.filter((r) => r.overdue > 0);
  if (query.unack) rows = rows.filter((r) => r.unacknowledged > 0);
  rows = sortRows(rows, query.sort, query.dir);

  return { scope, rows, departmentOptions, departmentId: department?.id ?? null };
}

function sortRows(rows: MemberRow[], key: SortKey, dir: "asc" | "desc"): MemberRow[] {
  const sign = dir === "desc" ? -1 : 1;
  const byName = (a: MemberRow, b: MemberRow) => a.fullName.localeCompare(b.fullName, "vi") || a.employeeCode.localeCompare(b.employeeCode);
  if (key === "name") return [...rows].sort((a, b) => sign * byName(a, b));
  return [...rows].sort((a, b) => {
    // Tỷ lệ null (không có khoá được giao) luôn xếp cuối
    const va = a[key] ?? -1;
    const vb = b[key] ?? -1;
    return sign * (va - vb) || byName(a, b);
  });
}
