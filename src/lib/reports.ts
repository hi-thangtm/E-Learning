import "server-only";
import { Prisma, type EnrollmentStatus } from "@prisma/client";
import { courseVisibleWhere } from "@/lib/course-scope";
import { prisma } from "@/lib/db";
import { vnDayEnd, vnDayStart } from "@/lib/format";
import { getTeamScope, type TeamActor, type TeamScope } from "@/lib/scope";
import { getParam, type SearchParams } from "@/lib/table-params";
import { buildChildrenMap, flattenTree, getDescendantIds } from "@/lib/tree";

/**
 * Báo cáo (Việc 27) — CHỈ chạy ở server. Định nghĩa chỉ số: src/lib/report-definitions.ts + docs/reports.md.
 * - Mọi hàm nhận (user, filters) và giới hạn người bằng getTeamScope (src/lib/scope.ts).
 * - SQL dựng bằng Prisma.sql / Prisma.join (tham số hoá, KHÔNG nối chuỗi). Truy vấn gộp, không lặp từng người.
 * - `db` mặc định prisma — script đo hiệu năng truyền transaction (rollback) vào.
 */

type Db = Prisma.TransactionClient;

export const REPORT_TABS = ["courses", "departments", "members", "versions", "certificates"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];
export const REPORT_TAB_LABELS: Record<ReportTab, string> = {
  courses: "Theo khoá học",
  departments: "Theo phòng ban",
  members: "Theo người",
  versions: "Nắm quy trình mới nhất",
  certificates: "Chứng nhận sắp hết hạn",
};
/** Tên dùng trong tên file Excel (không dấu) */
export const REPORT_TAB_FILE: Record<ReportTab | "all", string> = {
  courses: "KhoaHoc",
  departments: "PhongBan",
  members: "Nguoi",
  versions: "NamQuyTrinh",
  certificates: "ChungNhan",
  all: "ToanBo",
};

export const CERT_WINDOWS = ["30", "60", "90", "expired"] as const;
export type CertWindow = (typeof CERT_WINDOWS)[number];

// ---------------------------------------------------------------------------------------------
// Bộ lọc

export type ReportFilters = {
  companyId: string | null;
  departmentId: string | null;
  /** Gồm phòng con khi lọc phòng ban (mặc định có) */
  includeSub: boolean;
  categoryId: string | null;
  /** yyyy-MM-dd theo ngày giao (createdAt) */
  from: string | null;
  to: string | null;
  /** Tính cả khoá tự đăng ký (mặc định không) */
  includeSelf: boolean;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const idParam = (sp: SearchParams, key: string) => {
  const v = getParam(sp, key);
  return v && v.length <= 50 ? v : null;
};

export function parseReportFilters(sp: SearchParams): ReportFilters {
  const from = getParam(sp, "from");
  const to = getParam(sp, "to");
  return {
    companyId: idParam(sp, "company"),
    departmentId: idParam(sp, "department"),
    includeSub: getParam(sp, "sub") !== "0",
    categoryId: idParam(sp, "category"),
    from: ISO_DATE.test(from) ? from : null,
    to: ISO_DATE.test(to) ? to : null,
    includeSelf: getParam(sp, "self") === "1",
  };
}

/** Bộ lọc -> tham số URL (giữ lại khi chuyển tab / xuất Excel). */
export function filtersToParams(f: ReportFilters): Record<string, string> {
  const p: Record<string, string> = {};
  if (f.companyId) p.company = f.companyId;
  if (f.departmentId) p.department = f.departmentId;
  if (!f.includeSub) p.sub = "0";
  if (f.categoryId) p.category = f.categoryId;
  if (f.from) p.from = f.from;
  if (f.to) p.to = f.to;
  if (f.includeSelf) p.self = "1";
  return p;
}

// ---------------------------------------------------------------------------------------------
// Ngữ cảnh: phạm vi + người + phòng ban

export type ReportUser = {
  id: string;
  fullName: string;
  employeeCode: string;
  email: string | null;
  companyCode: string;
  departmentId: string | null;
  departmentName: string | null;
  positionName: string | null;
};

export type ReportDepartment = { id: string; parentId: string | null; name: string; isActive: boolean; companyId: string; companyCode: string };

export type ReportContext = {
  actor: TeamActor;
  scope: TeamScope;
  filters: ReportFilters;
  users: ReportUser[];
  userIds: string[];
  /** Phòng ban chọn được (trong phạm vi) */
  departments: ReportDepartment[];
  /** Tên hiển thị của bộ lọc (sheet Thông tin, nhật ký) */
  labels: { company: string | null; department: string | null; category: string | null };
  now: Date;
};

export async function resolveReportContext(actor: TeamActor, raw: ReportFilters, db: Db = prisma, now = new Date()): Promise<ReportContext> {
  const company =
    actor.role === "GROUP_ADMIN" && raw.companyId
      ? await db.company.findUnique({ where: { id: raw.companyId }, select: { id: true, name: true } })
      : null;
  const scope = await getTeamScope(actor, { companyId: company?.id ?? null });

  const departments: ReportDepartment[] = scope.empty
    ? []
    : (
        await db.department.findMany({
          where: scope.departmentIds ? { id: { in: scope.departmentIds } } : scope.companyId ? { companyId: scope.companyId } : {},
          orderBy: [{ companyId: "asc" }, { code: "asc" }],
          select: { id: true, parentId: true, name: true, isActive: true, companyId: true, company: { select: { code: true } } },
        })
      ).map((d) => ({ id: d.id, parentId: d.parentId, name: d.name, isActive: d.isActive, companyId: d.companyId, companyCode: d.company.code }));

  const department = departments.find((d) => d.id === raw.departmentId) ?? null;
  const departmentIds = department
    ? raw.includeSub
      ? [department.id, ...getDescendantIds(department.id, buildChildrenMap(departments))]
      : [department.id]
    : null;
  const category = raw.categoryId ? await db.courseCategory.findUnique({ where: { id: raw.categoryId }, select: { id: true, name: true } }) : null;

  const users = scope.empty
    ? []
    : (
        await db.user.findMany({
          where: { AND: [scope.where, ...(departmentIds ? [{ departmentId: { in: departmentIds } }] : [])] },
          orderBy: [{ fullName: "asc" }, { employeeCode: "asc" }],
          select: {
            id: true,
            fullName: true,
            employeeCode: true,
            email: true,
            company: { select: { code: true } },
            departmentId: true,
            department: { select: { name: true } },
            position: { select: { name: true } },
          },
        })
      ).map((u) => ({
        id: u.id,
        fullName: u.fullName,
        employeeCode: u.employeeCode,
        email: u.email,
        companyCode: u.company.code,
        departmentId: u.departmentId,
        departmentName: u.department?.name ?? null,
        positionName: u.position?.name ?? null,
      }));

  return {
    actor,
    scope,
    filters: {
      ...raw,
      companyId: company?.id ?? null,
      departmentId: department?.id ?? null,
      categoryId: category?.id ?? null,
      // Từ ngày > đến ngày -> bỏ "đến"
      to: raw.from && raw.to && raw.to < raw.from ? null : raw.to,
    },
    users,
    userIds: users.map((u) => u.id),
    departments,
    labels: { company: company?.name ?? null, department: department?.name ?? null, category: category?.name ?? null },
    now,
  };
}

/** Điều kiện lượt học dùng chung (alias e = enrollments, c = courses). Tham số hoá hoàn toàn. */
function enrollmentCond(ctx: ReportContext, opts: { ignoreDate?: boolean } = {}): Prisma.Sql {
  const f = ctx.filters;
  const parts: Prisma.Sql[] = [
    Prisma.sql`e."userId" = ANY(${ctx.userIds})`,
    Prisma.sql`e.status <> 'CANCELLED'`,
    f.includeSelf ? Prisma.sql`e.source IN ('RULE', 'ASSIGNED', 'SELF')` : Prisma.sql`e.source IN ('RULE', 'ASSIGNED')`,
  ];
  if (f.categoryId) parts.push(Prisma.sql`c."categoryId" = ${f.categoryId}`);
  if (!opts.ignoreDate && f.from) parts.push(Prisma.sql`e."createdAt" >= ${vnDayStart(f.from)}`);
  if (!opts.ignoreDate && f.to) parts.push(Prisma.sql`e."createdAt" <= ${vnDayEnd(f.to)}`);
  return Prisma.join(parts, " AND ");
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
/** Làm tròn 1 chữ số; `|| 0` đổi -0 (số âm rất nhỏ làm tròn) thành 0 để không hiện "-0" */
const round1 = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10 || 0);

// ---------------------------------------------------------------------------------------------
// Tab 1 — Theo khoá học

export type CourseReportRow = {
  courseId: string;
  code: string;
  title: string;
  categoryName: string | null;
  assigned: number;
  inProgress: number;
  notStarted: number;
  completed: number;
  overdue: number;
  completionRate: number | null;
  avgScore: number | null;
  firstPassRate: number | null;
  avgDaysToComplete: number | null;
  avgRating: number | null;
  ratingCount: number;
};

export async function courseReport(ctx: ReportContext, db: Db = prisma): Promise<CourseReportRow[]> {
  if (ctx.userIds.length === 0) return [];
  const now = ctx.now;
  const rows = await db.$queryRaw<
    (Omit<CourseReportRow, "completionRate" | "ratingCount"> & { ratingCount: number | null })[]
  >`
    WITH base AS (
      SELECT e."userId", e."courseId", e.status, e."dueDate", e."createdAt", e."completedAt"
      FROM enrollments e JOIN courses c ON c.id = e."courseId"
      WHERE ${enrollmentCond(ctx)}
    ),
    agg AS (
      SELECT "courseId",
        COUNT(*)::int AS "assigned",
        COUNT(*) FILTER (WHERE status = 'IN_PROGRESS' AND ("dueDate" IS NULL OR "dueDate" >= ${now}))::int AS "inProgress",
        COUNT(*) FILTER (WHERE status = 'NOT_STARTED' AND ("dueDate" IS NULL OR "dueDate" >= ${now}))::int AS "notStarted",
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS "completed",
        COUNT(*) FILTER (WHERE status <> 'COMPLETED' AND "dueDate" < ${now})::int AS "overdue",
        (AVG(EXTRACT(EPOCH FROM ("completedAt" - "createdAt")) / 86400) FILTER (WHERE status = 'COMPLETED' AND "completedAt" IS NOT NULL))::float AS "avgDaysToComplete"
      FROM base GROUP BY "courseId"
    ),
    best AS (
      SELECT s."courseId", qa."userId", qa."lessonId", MAX(qa.score) AS best,
        BOOL_OR(qa."attemptNo" = 1 AND COALESCE(qa.passed, false)) AS "firstPass"
      FROM quiz_attempts qa
      JOIN lessons l ON l.id = qa."lessonId"
      JOIN course_sections s ON s.id = l."sectionId"
      JOIN courses c ON c.id = s."courseId"
      JOIN base b ON b."userId" = qa."userId" AND b."courseId" = s."courseId"
      WHERE qa."submittedAt" IS NOT NULL AND qa.score IS NOT NULL AND qa."courseVersion" = c."currentVersion"
      GROUP BY s."courseId", qa."userId", qa."lessonId"
    ),
    q AS (
      SELECT "courseId", AVG(best)::float AS "avgScore", (AVG(CASE WHEN "firstPass" THEN 1 ELSE 0 END) * 100)::float AS "firstPassRate"
      FROM best GROUP BY "courseId"
    ),
    r AS (
      SELECT "courseId", AVG(rating)::float AS "avgRating", COUNT(*)::int AS "ratingCount"
      FROM course_reviews WHERE "courseId" IN (SELECT "courseId" FROM agg) GROUP BY "courseId"
    )
    SELECT agg."courseId", c.code, c.title, cat.name AS "categoryName",
      agg."assigned", agg."inProgress", agg."notStarted", agg."completed", agg."overdue", agg."avgDaysToComplete",
      q."avgScore", q."firstPassRate", r."avgRating", r."ratingCount"
    FROM agg
    JOIN courses c ON c.id = agg."courseId"
    LEFT JOIN course_categories cat ON cat.id = c."categoryId"
    LEFT JOIN q ON q."courseId" = agg."courseId"
    LEFT JOIN r ON r."courseId" = agg."courseId"
    ORDER BY agg."assigned" DESC, c.title ASC`;
  return rows.map((r) => ({
    ...r,
    completionRate: pct(r.completed, r.assigned),
    avgScore: round1(r.avgScore),
    firstPassRate: round1(r.firstPassRate),
    avgDaysToComplete: round1(r.avgDaysToComplete),
    avgRating: round1(r.avgRating),
    ratingCount: r.ratingCount ?? 0,
  }));
}

export type LearnerRow = {
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  status: EnrollmentStatus;
  progressPercent: number;
  dueDate: Date | null;
  overdue: boolean;
  bestScore: number | null;
  completedAt: Date | null;
  /** Tab Nắm quy trình */
  acknowledgedVersion: number | null;
  ackState: "unconfirmed" | "relearning" | null;
};

const REPORT_COURSE_SELECT = { id: true, code: true, title: true, currentVersion: true } as const;

/**
 * Khoá được xem trong báo cáo (Việc 29B #10): có lượt học của người trong phạm vi (getTeamScope → ctx.userIds)
 * HOẶC nằm trong phạm vi xem khoá (courseVisibleWhere). Ngoài phạm vi → null (coi như không tồn tại).
 */
export async function findReportCourse(ctx: ReportContext, courseId: string, db: Db = prisma) {
  if (!courseId || courseId.length > 50) return null;
  return db.course.findFirst({
    where: {
      id: courseId,
      OR: [
        ...(ctx.userIds.length ? [{ enrollments: { some: { userId: { in: ctx.userIds } } } }] : []),
        await courseVisibleWhere(ctx.actor),
      ],
    },
    select: REPORT_COURSE_SELECT,
  });
}

/** Người của 1 khoá (theo bộ lọc). `mode = "unacknowledged"` -> chỉ người chưa nắm bản mới nhất (tab Nắm quy trình). */
export async function courseLearners(
  ctx: ReportContext,
  courseId: string,
  mode: "all" | "unacknowledged" = "all",
  db: Db = prisma,
): Promise<{ course: { id: string; code: string; title: string; currentVersion: number }; rows: LearnerRow[] } | null> {
  const course = await findReportCourse(ctx, courseId, db);
  if (!course || ctx.userIds.length === 0) return course ? { course, rows: [] } : null;
  const extra =
    mode === "unacknowledged"
      ? Prisma.sql`AND e."completedVersion" IS NOT NULL AND COALESCE(e."acknowledgedVersion", 0) < c."currentVersion"`
      : Prisma.empty;
  const rows = await db.$queryRaw<
    { userId: string; status: EnrollmentStatus; progressPercent: number; dueDate: Date | null; completedAt: Date | null; acknowledgedVersion: number | null; bestScore: number | null }[]
  >`
    SELECT e."userId", e.status, e."progressPercent", e."dueDate", e."completedAt", e."acknowledgedVersion",
      (SELECT MAX(qa.score) FROM quiz_attempts qa
         JOIN lessons l ON l.id = qa."lessonId" JOIN course_sections s ON s.id = l."sectionId"
        WHERE qa."userId" = e."userId" AND s."courseId" = e."courseId" AND qa."submittedAt" IS NOT NULL
          AND qa."courseVersion" = c."currentVersion") AS "bestScore"
    FROM enrollments e JOIN courses c ON c.id = e."courseId"
    WHERE e."courseId" = ${course.id} AND ${enrollmentCond(ctx)} ${extra}`;
  const userOf = new Map(ctx.users.map((u) => [u.id, u]));
  return {
    course,
    rows: rows
      .map((r) => {
        const u = userOf.get(r.userId)!;
        return {
          userId: r.userId,
          fullName: u.fullName,
          employeeCode: u.employeeCode,
          departmentName: u.departmentName,
          status: r.status,
          progressPercent: r.progressPercent,
          dueDate: r.dueDate,
          overdue: r.status !== "COMPLETED" && !!r.dueDate && r.dueDate < ctx.now,
          bestScore: r.bestScore,
          completedAt: r.completedAt,
          acknowledgedVersion: r.acknowledgedVersion,
          ackState:
            mode === "unacknowledged" ? (r.status === "COMPLETED" ? ("unconfirmed" as const) : ("relearning" as const)) : null,
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi")),
  };
}

// ---------------------------------------------------------------------------------------------
// Số liệu theo người (dùng cho tab Phòng ban + Theo người)

type PersonAgg = { userId: string; assigned: number; completed: number; overdue: number; avgScore: number | null };

async function personAggregates(ctx: ReportContext, db: Db): Promise<Map<string, PersonAgg>> {
  if (ctx.userIds.length === 0) return new Map();
  const now = ctx.now;
  const rows = await db.$queryRaw<PersonAgg[]>`
    WITH base AS (
      SELECT e."userId", e."courseId", e.status, e."dueDate"
      FROM enrollments e JOIN courses c ON c.id = e."courseId"
      WHERE ${enrollmentCond(ctx)}
    ),
    agg AS (
      SELECT "userId",
        COUNT(*)::int AS "assigned",
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int AS "completed",
        COUNT(*) FILTER (WHERE status <> 'COMPLETED' AND "dueDate" < ${now})::int AS "overdue"
      FROM base GROUP BY "userId"
    ),
    best AS (
      SELECT qa."userId", qa."lessonId", MAX(qa.score) AS best
      FROM quiz_attempts qa
      JOIN lessons l ON l.id = qa."lessonId"
      JOIN course_sections s ON s.id = l."sectionId"
      JOIN courses c ON c.id = s."courseId"
      JOIN base b ON b."userId" = qa."userId" AND b."courseId" = s."courseId"
      WHERE qa."submittedAt" IS NOT NULL AND qa.score IS NOT NULL AND qa."courseVersion" = c."currentVersion"
      GROUP BY qa."userId", qa."lessonId"
    )
    SELECT agg."userId", agg."assigned", agg."completed", agg."overdue", sc."avgScore"
    FROM agg
    LEFT JOIN (SELECT "userId", AVG(best)::float AS "avgScore" FROM best GROUP BY "userId") sc ON sc."userId" = agg."userId"`;
  return new Map(rows.map((r) => [r.userId, { ...r, avgScore: round1(r.avgScore) }]));
}

// ---------------------------------------------------------------------------------------------
// Tab 2 — Theo phòng ban

export type DepartmentReportRow = {
  departmentId: string;
  name: string;
  depth: number;
  companyCode: string;
  memberCount: number;
  assigned: number;
  completed: number;
  overdue: number;
  completionRate: number | null;
};

export async function departmentReport(ctx: ReportContext, cumulative: boolean, db: Db = prisma): Promise<DepartmentReportRow[]> {
  const people = await personAggregates(ctx, db);
  const own = new Map<string, { memberCount: number; assigned: number; completed: number; overdue: number }>();
  for (const u of ctx.users) {
    const key = u.departmentId ?? "";
    const s = own.get(key) ?? { memberCount: 0, assigned: 0, completed: 0, overdue: 0 };
    const p = people.get(u.id);
    s.memberCount++;
    s.assigned += p?.assigned ?? 0;
    s.completed += p?.completed ?? 0;
    s.overdue += p?.overdue ?? 0;
    own.set(key, s);
  }

  // Lọc 1 phòng -> chỉ cây con của phòng đó
  let departments = ctx.departments;
  if (ctx.filters.departmentId) {
    const keep = ctx.filters.includeSub
      ? new Set([ctx.filters.departmentId, ...getDescendantIds(ctx.filters.departmentId, buildChildrenMap(departments))])
      : new Set([ctx.filters.departmentId]);
    departments = departments.filter((d) => keep.has(d.id));
  }
  const children = buildChildrenMap(departments);
  const empty = { memberCount: 0, assigned: 0, completed: 0, overdue: 0 };

  const rows: DepartmentReportRow[] = flattenTree(departments, "all").map(({ row, depth }) => {
    const ids = cumulative ? [row.id, ...getDescendantIds(row.id, children)] : [row.id];
    const sum = ids.reduce(
      (acc, id) => {
        const s = own.get(id) ?? empty;
        return {
          memberCount: acc.memberCount + s.memberCount,
          assigned: acc.assigned + s.assigned,
          completed: acc.completed + s.completed,
          overdue: acc.overdue + s.overdue,
        };
      },
      { ...empty },
    );
    return { departmentId: row.id, name: row.name, depth, companyCode: row.companyCode, ...sum, completionRate: pct(sum.completed, sum.assigned) };
  });
  const none = own.get("");
  if (none && !ctx.filters.departmentId) {
    rows.push({ departmentId: "", name: "Chưa có phòng ban", depth: 0, companyCode: "", ...none, completionRate: pct(none.completed, none.assigned) });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// Tab 3 — Theo người

export type MemberReportRow = ReportUser & {
  assigned: number;
  completed: number;
  overdue: number;
  completionRate: number | null;
  avgScore: number | null;
  validCertificates: number;
  lastActivity: Date | null;
};

export async function memberReport(ctx: ReportContext, db: Db = prisma): Promise<MemberReportRow[]> {
  if (ctx.userIds.length === 0) return [];
  const [people, certs, activity] = await Promise.all([
    personAggregates(ctx, db),
    db.certificate.groupBy({
      by: ["userId"],
      where: { userId: { in: ctx.userIds }, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: ctx.now } }] },
      _count: { _all: true },
    }),
    db.$queryRaw<{ userId: string; last: Date }[]>`
      SELECT "userId", MAX("updatedAt") AS "last" FROM lesson_progress WHERE "userId" = ANY(${ctx.userIds}) GROUP BY "userId"`,
  ]);
  const certOf = new Map(certs.map((c) => [c.userId, c._count._all]));
  const lastOf = new Map(activity.map((a) => [a.userId, a.last]));
  return ctx.users.map((u) => {
    const p = people.get(u.id);
    return {
      ...u,
      assigned: p?.assigned ?? 0,
      completed: p?.completed ?? 0,
      overdue: p?.overdue ?? 0,
      completionRate: pct(p?.completed ?? 0, p?.assigned ?? 0),
      avgScore: p?.avgScore ?? null,
      validCertificates: certOf.get(u.id) ?? 0,
      lastActivity: lastOf.get(u.id) ?? null,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Tab 4 — Nắm quy trình mới nhất

export type VersionReportRow = {
  courseId: string;
  code: string;
  title: string;
  currentVersion: number;
  latestPublishedAt: Date | null;
  latestChangeType: "INITIAL" | "MAJOR" | "MINOR" | null;
  everCompleted: number;
  acknowledged: number;
  unconfirmed: number;
  relearning: number;
  ackRate: number | null;
};

export async function versionReport(ctx: ReportContext, db: Db = prisma): Promise<VersionReportRow[]> {
  if (ctx.userIds.length === 0) return [];
  const rows = await db.$queryRaw<Omit<VersionReportRow, "ackRate">[]>`
    WITH agg AS (
      SELECT e."courseId",
        COUNT(*) FILTER (WHERE e."completedVersion" IS NOT NULL)::int AS "everCompleted",
        COUNT(*) FILTER (WHERE e."completedVersion" IS NOT NULL AND e."acknowledgedVersion" = c."currentVersion")::int AS "acknowledged",
        COUNT(*) FILTER (WHERE e.status = 'COMPLETED' AND COALESCE(e."acknowledgedVersion", 0) < c."currentVersion")::int AS "unconfirmed",
        COUNT(*) FILTER (WHERE e.status <> 'COMPLETED' AND e."completedVersion" IS NOT NULL)::int AS "relearning"
      FROM enrollments e JOIN courses c ON c.id = e."courseId"
      WHERE ${enrollmentCond(ctx)} AND c."currentVersion" >= 2
      GROUP BY e."courseId"
    )
    SELECT agg.*, c.code, c.title, c."currentVersion",
      v."publishedAt" AS "latestPublishedAt", v."changeType"::text AS "latestChangeType"
    FROM agg
    JOIN courses c ON c.id = agg."courseId"
    LEFT JOIN course_versions v ON v."courseId" = c.id AND v."versionNo" = c."currentVersion" AND v.status = 'PUBLISHED'
    WHERE agg."everCompleted" > 0
    ORDER BY c.title ASC`;
  return rows.map((r) => ({ ...r, ackRate: pct(r.acknowledged, r.everCompleted) }));
}

// ---------------------------------------------------------------------------------------------
// Tab 5 — Chứng nhận sắp hết hạn

export type CertificateReportRow = {
  certificateId: string;
  userId: string;
  fullName: string;
  employeeCode: string;
  departmentName: string | null;
  courseId: string;
  courseTitle: string;
  code: string;
  issuedAt: Date;
  expiresAt: Date;
  daysLeft: number;
  relearnStatus: EnrollmentStatus | null;
};

/** Còn hạn trong N ngày, hoặc “đã hết hạn chưa học lại” (chứng nhận MỚI NHẤT của người × khoá đã hết hạn). Không lọc ngày giao / nguồn. */
export async function certificateReport(ctx: ReportContext, window: CertWindow, db: Db = prisma): Promise<CertificateReportRow[]> {
  if (ctx.userIds.length === 0) return [];
  const now = ctx.now;
  const cond =
    window === "expired"
      ? Prisma.sql`latest."expiresAt" < ${now}`
      : Prisma.sql`latest."expiresAt" >= ${now} AND latest."expiresAt" <= ${new Date(now.getTime() + Number(window) * 86_400_000)}`;
  const category = ctx.filters.categoryId ? Prisma.sql`AND c."categoryId" = ${ctx.filters.categoryId}` : Prisma.empty;
  const rows = await db.$queryRaw<
    { id: string; userId: string; courseId: string; courseTitle: string; code: string; issuedAt: Date; expiresAt: Date; relearnStatus: EnrollmentStatus | null }[]
  >`
    WITH latest AS (
      SELECT DISTINCT ON (ct."userId", ct."courseId") ct.id, ct."userId", ct."courseId", ct."courseTitle", ct.code, ct."issuedAt", ct."expiresAt"
      FROM certificates ct
      WHERE ct."userId" = ANY(${ctx.userIds}) AND ct."courseId" IS NOT NULL AND ct."revokedAt" IS NULL
      ORDER BY ct."userId", ct."courseId", ct."issuedAt" DESC
    )
    SELECT latest.*, e.status::text AS "relearnStatus"
    FROM latest
    JOIN courses c ON c.id = latest."courseId"
    LEFT JOIN enrollments e ON e."userId" = latest."userId" AND e."courseId" = latest."courseId" AND e.status <> 'CANCELLED'
    WHERE latest."expiresAt" IS NOT NULL AND ${cond} ${category}
    ORDER BY latest."expiresAt" ASC`;
  const userOf = new Map(ctx.users.map((u) => [u.id, u]));
  return rows.map((r) => {
    const u = userOf.get(r.userId)!;
    return {
      certificateId: r.id,
      userId: r.userId,
      fullName: u.fullName,
      employeeCode: u.employeeCode,
      departmentName: u.departmentName,
      courseId: r.courseId,
      courseTitle: r.courseTitle,
      code: r.code,
      issuedAt: r.issuedAt,
      expiresAt: r.expiresAt,
      daysLeft: Math.ceil((r.expiresAt.getTime() - now.getTime()) / 86_400_000),
      relearnStatus: r.relearnStatus,
    };
  });
}

// ---------------------------------------------------------------------------------------------
// Sắp xếp + phân trang trong bộ nhớ

export function sortRows<T>(rows: T[], key: string | null, dir: "asc" | "desc"): T[] {
  if (!key) return rows;
  const sign = dir === "desc" ? -1 : 1;
  return [...rows].sort((a, b) => {
    const va = (a as Record<string, unknown>)[key];
    const vb = (b as Record<string, unknown>)[key];
    // Giá trị trống luôn xếp cuối
    if (va === null || va === undefined) return vb === null || vb === undefined ? 0 : 1;
    if (vb === null || vb === undefined) return -1;
    if (va instanceof Date && vb instanceof Date) return sign * (va.getTime() - vb.getTime());
    if (typeof va === "number" && typeof vb === "number") return sign * (va - vb);
    return sign * String(va).localeCompare(String(vb), "vi");
  });
}
