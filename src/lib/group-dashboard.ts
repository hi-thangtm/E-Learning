import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Dashboard tập đoàn (Việc 28B — feature-spec 6.3). CHỈ chạy ở server, chỉ Admin tập đoàn gọi.
 * Định nghĩa chỉ số giống docs/reports.md / src/lib/report-definitions.ts:
 * - Nhân viên = người đang làm (ACTIVE) của công ty đang hoạt động.
 * - Khoá được giao = enrollment RULE / ASSIGNED khác CANCELLED. Tỷ lệ hoàn thành = hoàn thành ÷ được giao.
 * - Người quá hạn = có ≥ 1 khoá được giao quá hạn (dueDate < bây giờ, chưa COMPLETED).
 * - Tỷ lệ nắm quy trình mới nhất = trên các khoá có phiên bản ≥ 2: đã nắm (acknowledgedVersion = currentVersion) ÷ đã từng hoàn thành.
 * - Người học trong 30 ngày = có tiến độ bài học cập nhật trong 30 ngày qua.
 * Truy vấn gộp theo công ty (GROUP BY), không lặp từng người.
 */

const DAY_MS = 86_400_000;
/** `db` mặc định prisma — script đo hiệu năng truyền transaction (rollback). */
type Db = Prisma.TransactionClient;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);

export type CompanyStats = {
  companyId: string;
  code: string;
  name: string;
  isGroup: boolean;
  memberCount: number;
  assigned: number;
  completed: number;
  completionRate: number | null;
  overduePeople: number;
  overduePeopleRate: number | null;
  everCompleted: number;
  acknowledged: number;
  ackRate: number | null;
  activeLearners: number;
  activeRate: number | null;
};

export type GroupTotals = Omit<CompanyStats, "companyId" | "code" | "name" | "isGroup"> & {
  publishedCourses: number;
  validCertificates: number;
};

export async function getCompanyStats(now = new Date(), db: Db = prisma): Promise<{ companies: CompanyStats[]; totals: GroupTotals }> {
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const [companies, members, enroll, active, publishedCourses, validCertificates] = await Promise.all([
    db.company.findMany({
      where: { isActive: true },
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      select: { id: true, code: true, name: true, parentId: true },
    }),
    db.user.groupBy({ by: ["companyId"], where: { status: "ACTIVE", company: { isActive: true } }, _count: { _all: true } }),
    db.$queryRaw<
      { companyId: string; assigned: number; completed: number; overduePeople: number; everCompleted: number; acknowledged: number }[]
    >`
      SELECT u."companyId",
        COUNT(*) FILTER (WHERE e.source IN ('RULE', 'ASSIGNED'))::int AS "assigned",
        COUNT(*) FILTER (WHERE e.source IN ('RULE', 'ASSIGNED') AND e.status = 'COMPLETED')::int AS "completed",
        COUNT(DISTINCT e."userId") FILTER (WHERE e.source IN ('RULE', 'ASSIGNED') AND e.status <> 'COMPLETED' AND e."dueDate" < ${now})::int AS "overduePeople",
        COUNT(*) FILTER (WHERE c."currentVersion" >= 2 AND e."completedVersion" IS NOT NULL)::int AS "everCompleted",
        COUNT(*) FILTER (WHERE c."currentVersion" >= 2 AND e."completedVersion" IS NOT NULL AND e."acknowledgedVersion" = c."currentVersion")::int AS "acknowledged"
      FROM enrollments e
      JOIN users u ON u.id = e."userId"
      JOIN companies co ON co.id = u."companyId"
      JOIN courses c ON c.id = e."courseId"
      WHERE e.status <> 'CANCELLED' AND u.status = 'ACTIVE' AND co."isActive" = true
      GROUP BY u."companyId"`,
    db.$queryRaw<{ companyId: string; activeLearners: number }[]>`
      SELECT u."companyId", COUNT(DISTINCT lp."userId")::int AS "activeLearners"
      FROM lesson_progress lp
      JOIN users u ON u.id = lp."userId"
      WHERE lp."updatedAt" >= ${since} AND u.status = 'ACTIVE'
      GROUP BY u."companyId"`,
    db.course.count({ where: { status: "PUBLISHED" } }),
    db.certificate.count({
      where: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }], user: { status: "ACTIVE", company: { isActive: true } } },
    }),
  ]);

  const memberOf = new Map(members.map((m) => [m.companyId, m._count._all]));
  const enrollOf = new Map(enroll.map((e) => [e.companyId, e]));
  const activeOf = new Map(active.map((a) => [a.companyId, a.activeLearners]));

  const rows: CompanyStats[] = companies.map((c) => {
    const memberCount = memberOf.get(c.id) ?? 0;
    const e = enrollOf.get(c.id);
    const activeLearners = activeOf.get(c.id) ?? 0;
    const assigned = e?.assigned ?? 0;
    const completed = e?.completed ?? 0;
    const overduePeople = e?.overduePeople ?? 0;
    const everCompleted = e?.everCompleted ?? 0;
    const acknowledged = e?.acknowledged ?? 0;
    return {
      companyId: c.id,
      code: c.code,
      name: c.name,
      isGroup: !c.parentId,
      memberCount,
      assigned,
      completed,
      completionRate: pct(completed, assigned),
      overduePeople,
      overduePeopleRate: pct(overduePeople, memberCount),
      everCompleted,
      acknowledged,
      ackRate: pct(acknowledged, everCompleted),
      activeLearners,
      activeRate: pct(activeLearners, memberCount),
    };
  });

  const sum = (k: "memberCount" | "assigned" | "completed" | "overduePeople" | "everCompleted" | "acknowledged" | "activeLearners") =>
    rows.reduce((s, r) => s + r[k], 0);
  const memberCount = sum("memberCount");
  const totals: GroupTotals = {
    memberCount,
    assigned: sum("assigned"),
    completed: sum("completed"),
    completionRate: pct(sum("completed"), sum("assigned")),
    overduePeople: sum("overduePeople"),
    overduePeopleRate: pct(sum("overduePeople"), memberCount),
    everCompleted: sum("everCompleted"),
    acknowledged: sum("acknowledged"),
    ackRate: pct(sum("acknowledged"), sum("everCompleted")),
    activeLearners: sum("activeLearners"),
    activeRate: pct(sum("activeLearners"), memberCount),
    publishedCourses,
    validCertificates,
  };
  return { companies: rows, totals };
}

export type MonthlyPoint = { month: string; label: string; completions: number };

/** Số lượt hoàn thành khoá theo tháng (giờ VN), 12 tháng gần nhất kể cả tháng này; `companyId` = lọc 1 công ty. */
export async function getMonthlyCompletions(companyId: string | null, now = new Date(), db: Db = prisma): Promise<MonthlyPoint[]> {
  const vn = new Date(now.getTime() + 7 * 3_600_000);
  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth() - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    months.push({ key, label: `${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}` });
  }
  // Mốc đầu: 00:00 giờ VN ngày 1 của tháng đầu tiên
  const start = new Date(`${months[0].key}-01T00:00:00+07:00`);
  const company = companyId ? Prisma.sql`AND u."companyId" = ${companyId}` : Prisma.empty;
  const rows = await db.$queryRaw<{ month: string; completions: number }[]>`
    SELECT to_char(date_trunc('month', e."completedAt" + interval '7 hours'), 'YYYY-MM') AS "month", COUNT(*)::int AS "completions"
    FROM enrollments e
    JOIN users u ON u.id = e."userId"
    WHERE e."completedAt" IS NOT NULL AND e."completedAt" >= ${start} AND e.status <> 'CANCELLED' ${company}
    GROUP BY 1`;
  const of = new Map(rows.map((r) => [r.month, r.completions]));
  return months.map((m) => ({ month: m.key, label: m.label, completions: of.get(m.key) ?? 0 }));
}

export type AttentionCourse = { courseId: string; code: string; title: string; assigned: number; value: number; part: number; whole: number };

/** 5 khoá tỷ lệ quá hạn cao nhất (≥ 5 người được giao) + 5 khoá tỷ lệ nắm phiên bản mới thấp nhất (phiên bản ≥ 2). */
export async function getAttentionCourses(now = new Date(), db: Db = prisma): Promise<{ overdue: AttentionCourse[]; ack: AttentionCourse[] }> {
  const rows = await db.$queryRaw<
    { courseId: string; code: string; title: string; currentVersion: number; assigned: number; overdue: number; everCompleted: number; acknowledged: number }[]
  >`
    SELECT c.id AS "courseId", c.code, c.title, c."currentVersion",
      COUNT(*) FILTER (WHERE e.source IN ('RULE', 'ASSIGNED'))::int AS "assigned",
      COUNT(*) FILTER (WHERE e.source IN ('RULE', 'ASSIGNED') AND e.status <> 'COMPLETED' AND e."dueDate" < ${now})::int AS "overdue",
      COUNT(*) FILTER (WHERE e."completedVersion" IS NOT NULL)::int AS "everCompleted",
      COUNT(*) FILTER (WHERE e."completedVersion" IS NOT NULL AND e."acknowledgedVersion" = c."currentVersion")::int AS "acknowledged"
    FROM enrollments e
    JOIN courses c ON c.id = e."courseId"
    JOIN users u ON u.id = e."userId"
    JOIN companies co ON co.id = u."companyId"
    WHERE e.status <> 'CANCELLED' AND u.status = 'ACTIVE' AND co."isActive" = true
    GROUP BY c.id, c.code, c.title, c."currentVersion"`;

  const overdue = rows
    .filter((r) => r.assigned >= 5 && r.overdue > 0)
    .map((r) => ({ courseId: r.courseId, code: r.code, title: r.title, assigned: r.assigned, part: r.overdue, whole: r.assigned, value: pct(r.overdue, r.assigned)! }))
    .sort((a, b) => b.value - a.value || b.part - a.part)
    .slice(0, 5);
  const ack = rows
    .filter((r) => r.currentVersion >= 2 && r.everCompleted > 0)
    .map((r) => ({ courseId: r.courseId, code: r.code, title: r.title, assigned: r.assigned, part: r.acknowledged, whole: r.everCompleted, value: pct(r.acknowledged, r.everCompleted)! }))
    .sort((a, b) => a.value - b.value || b.whole - a.whole)
    .slice(0, 5);
  return { overdue, ack };
}
