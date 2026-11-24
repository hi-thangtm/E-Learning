import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { TeamScope } from "@/lib/scope";

/**
 * Số liệu Đội của tôi (Việc 26) — CHỈ chạy ở server, luôn trên danh sách người đã lọc bằng getTeamScope (src/lib/scope.ts).
 * - “Khoá được giao” = enrollment source RULE hoặc ASSIGNED, khác CANCELLED. Tự đăng ký (SELF) không tính.
 * - Quá hạn = dueDate < bây giờ và chưa COMPLETED.
 * - Chưa nắm quy trình mới = COMPLETED và acknowledgedVersion < courses.currentVersion (có bản MINOR chưa xác nhận).
 * - Tỷ lệ hoàn thành = đã xong ÷ được giao.
 * Truy vấn gộp (GROUP BY + FILTER), không lặp từng người.
 */

export type TeamMember = {
  id: string;
  fullName: string;
  employeeCode: string;
  email: string | null;
  avatarUrl: string | null;
  departmentId: string | null;
  departmentName: string | null;
  positionName: string | null;
  /** Mã công ty — phân biệt phòng trùng tên khi Admin tập đoàn xem cả tập đoàn */
  companyCode: string;
};

export type MemberStats = {
  assigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  unacknowledged: number;
  /** Quá hạn lâu nhất (ngày); 0 = không quá hạn */
  maxOverdueDays: number;
  /** % 0–100; null = không có khoá được giao */
  rate: number | null;
};

export type MemberRow = TeamMember & MemberStats;

const EMPTY_STATS: MemberStats = {
  assigned: 0,
  completed: 0,
  inProgress: 0,
  notStarted: 0,
  overdue: 0,
  unacknowledged: 0,
  maxOverdueDays: 0,
  rate: null,
};

/** Người trong phạm vi (kèm phòng ban / chức danh). `extra` = điều kiện lọc thêm (tìm kiếm, phòng ban...). */
export async function loadTeamMembers(scope: TeamScope, extra: Prisma.UserWhereInput[] = []): Promise<TeamMember[]> {
  if (scope.empty) return [];
  const users = await prisma.user.findMany({
    where: { AND: [scope.where, ...extra] },
    orderBy: [{ fullName: "asc" }, { employeeCode: "asc" }],
    select: {
      id: true,
      fullName: true,
      employeeCode: true,
      email: true,
      avatarUrl: true,
      departmentId: true,
      department: { select: { name: true } },
      position: { select: { name: true } },
      company: { select: { code: true } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    employeeCode: u.employeeCode,
    email: u.email,
    avatarUrl: u.avatarUrl,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    positionName: u.position?.name ?? null,
    companyCode: u.company.code,
  }));
}

type StatsRow = {
  userId: string;
  assigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
  unacknowledged: number;
  maxOverdueDays: number;
};

/** Số liệu theo người — 1 truy vấn gộp. */
export async function getMemberStats(userIds: string[], now = new Date()): Promise<Map<string, MemberStats>> {
  const result = new Map<string, MemberStats>();
  if (userIds.length === 0) return result;
  const rows = await prisma.$queryRaw<StatsRow[]>`
    SELECT e."userId",
      COUNT(*)::int AS "assigned",
      COUNT(*) FILTER (WHERE e.status = 'COMPLETED')::int AS "completed",
      COUNT(*) FILTER (WHERE e.status = 'IN_PROGRESS')::int AS "inProgress",
      COUNT(*) FILTER (WHERE e.status = 'NOT_STARTED')::int AS "notStarted",
      COUNT(*) FILTER (WHERE e.status <> 'COMPLETED' AND e."dueDate" < ${now})::int AS "overdue",
      COUNT(*) FILTER (WHERE e.status = 'COMPLETED' AND COALESCE(e."acknowledgedVersion", 0) < c."currentVersion")::int AS "unacknowledged",
      COALESCE(MAX(CEIL(EXTRACT(EPOCH FROM (${now}::timestamp - e."dueDate")) / 86400))
        FILTER (WHERE e.status <> 'COMPLETED' AND e."dueDate" < ${now}), 0)::int AS "maxOverdueDays"
    FROM enrollments e
    JOIN courses c ON c.id = e."courseId"
    WHERE e."userId" = ANY(${userIds})
      AND e.source IN ('RULE', 'ASSIGNED')
      AND e.status <> 'CANCELLED'
    GROUP BY e."userId"`;
  for (const r of rows) {
    result.set(r.userId, {
      assigned: r.assigned,
      completed: r.completed,
      inProgress: r.inProgress,
      notStarted: r.notStarted,
      overdue: r.overdue,
      unacknowledged: r.unacknowledged,
      maxOverdueDays: r.maxOverdueDays,
      rate: r.assigned ? Math.round((r.completed / r.assigned) * 100) : null,
    });
  }
  return result;
}

/** Người + số liệu (người không có khoá được giao vẫn có dòng, số 0). */
export async function getMemberRows(scope: TeamScope, extra: Prisma.UserWhereInput[] = []): Promise<MemberRow[]> {
  const members = await loadTeamMembers(scope, extra);
  const stats = await getMemberStats(members.map((m) => m.id));
  return members.map((m) => ({ ...m, ...(stats.get(m.id) ?? EMPTY_STATS) }));
}

export type CourseProgress = {
  courseId: string;
  title: string;
  code: string;
  assigned: number;
  completed: number;
  inProgress: number;
  notStarted: number;
  overdue: number;
};

/** Theo khoá (top N theo số người được giao): Hoàn thành / Đang học / Chưa bắt đầu / Quá hạn (loại trừ nhau). */
export async function getCourseProgress(userIds: string[], top = 10, now = new Date()): Promise<CourseProgress[]> {
  if (userIds.length === 0) return [];
  return prisma.$queryRaw<CourseProgress[]>`
    SELECT c.id AS "courseId", c.title, c.code,
      COUNT(*)::int AS "assigned",
      COUNT(*) FILTER (WHERE e.status = 'COMPLETED')::int AS "completed",
      COUNT(*) FILTER (WHERE e.status = 'IN_PROGRESS' AND (e."dueDate" IS NULL OR e."dueDate" >= ${now}))::int AS "inProgress",
      COUNT(*) FILTER (WHERE e.status = 'NOT_STARTED' AND (e."dueDate" IS NULL OR e."dueDate" >= ${now}))::int AS "notStarted",
      COUNT(*) FILTER (WHERE e.status <> 'COMPLETED' AND e."dueDate" < ${now})::int AS "overdue"
    FROM enrollments e
    JOIN courses c ON c.id = e."courseId"
    WHERE e."userId" = ANY(${userIds})
      AND e.source IN ('RULE', 'ASSIGNED')
      AND e.status <> 'CANCELLED'
    GROUP BY c.id, c.title, c.code
    ORDER BY COUNT(*) DESC, c.title ASC
    LIMIT ${top}`;
}

export type DepartmentRate = { departmentId: string | null; name: string; companyCode: string; members: number; assigned: number; completed: number; rate: number };

/** Tỷ lệ hoàn thành theo phòng ban (gộp từ số liệu theo người). */
export function getDepartmentRates(rows: MemberRow[]): DepartmentRate[] {
  const map = new Map<string, DepartmentRate>();
  for (const r of rows) {
    // “Chưa có phòng ban” tách theo công ty
    const key = r.departmentId ?? `none:${r.companyCode}`;
    const d = map.get(key) ?? {
      departmentId: r.departmentId,
      name: r.departmentName ?? "Chưa có phòng ban",
      companyCode: r.companyCode,
      members: 0,
      assigned: 0,
      completed: 0,
      rate: 0,
    };
    d.members++;
    d.assigned += r.assigned;
    d.completed += r.completed;
    map.set(key, d);
  }
  return [...map.values()]
    .filter((d) => d.assigned > 0)
    .map((d) => ({ ...d, rate: Math.round((d.completed / d.assigned) * 100) }))
    .sort((a, b) => b.rate - a.rate || a.name.localeCompare(b.name, "vi"));
}

export type TeamOverview = {
  memberCount: number;
  assigned: number;
  completed: number;
  /** % hoàn thành khoá được giao (null = chưa giao khoá nào) */
  rate: number | null;
  overduePeople: number;
  unacknowledgedPeople: number;
  topOverdue: MemberRow[];
  topUnacknowledged: MemberRow[];
  departments: DepartmentRate[];
};

export async function getTeamOverview(scope: TeamScope): Promise<TeamOverview> {
  const rows = await getMemberRows(scope);
  const assigned = rows.reduce((s, r) => s + r.assigned, 0);
  const completed = rows.reduce((s, r) => s + r.completed, 0);
  return {
    memberCount: rows.length,
    assigned,
    completed,
    rate: assigned ? Math.round((completed / assigned) * 100) : null,
    overduePeople: rows.filter((r) => r.overdue > 0).length,
    unacknowledgedPeople: rows.filter((r) => r.unacknowledged > 0).length,
    topOverdue: rows
      .filter((r) => r.overdue > 0)
      .sort((a, b) => b.overdue - a.overdue || b.maxOverdueDays - a.maxOverdueDays)
      .slice(0, 10),
    topUnacknowledged: rows
      .filter((r) => r.unacknowledged > 0)
      .sort((a, b) => b.unacknowledged - a.unacknowledged)
      .slice(0, 10),
    departments: getDepartmentRates(rows),
  };
}
