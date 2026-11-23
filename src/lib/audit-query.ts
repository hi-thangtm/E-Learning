import "server-only";
import type { Prisma } from "@prisma/client";
import {
  AUDIT_GROUP_LABELS,
  auditActionGroup,
  auditActionLabel,
  auditGroupWhere,
  describeAuditEntry,
  ENTITY_LABELS,
  type AuditEntityType,
  type AuditGroup,
} from "@/lib/audit";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { addDaysIso, validIsoDate, vnDayStart, vnIsoDate } from "@/lib/format";
import { getParam, type SearchParams } from "@/lib/table-params";

/**
 * Truy vấn nhật ký thao tác (server). Phạm vi (Quy tắc 1): Admin công ty chỉ thấy nhật ký có
 * companyId = công ty mình; Admin tập đoàn thấy tất cả. Chỉ đọc — không có hàm sửa / xoá nhật ký.
 */

export const DEFAULT_RANGE_DAYS = 30;
export const AUDIT_GROUP_VALUES = Object.keys(AUDIT_GROUP_LABELS) as AuditGroup[];
export const AUDIT_ENTITY_VALUES = Object.keys(ENTITY_LABELS) as AuditEntityType[];

export function auditScopeWhere(actor: CurrentUser): Prisma.AuditLogWhereInput {
  return actor.role === "GROUP_ADMIN" ? {} : { companyId: actor.companyId };
}

export type AuditFilters = {
  from: string;
  to: string;
  q: string;
  group?: AuditGroup;
  entity?: AuditEntityType;
  companyId?: string;
};

/** Đọc bộ lọc từ URL + dựng điều kiện Prisma (dùng chung cho trang và xuất Excel). */
export function buildAuditWhere(actor: CurrentUser, sp: SearchParams) {
  const today = vnIsoDate();
  let to = validIsoDate(getParam(sp, "to")) ?? today;
  let from = validIsoDate(getParam(sp, "from")) ?? addDaysIso(to, -(DEFAULT_RANGE_DAYS - 1));
  if (from > to) [from, to] = [to, from];

  const q = getParam(sp, "q").slice(0, 100);
  const groupParam = getParam(sp, "group");
  const group = AUDIT_GROUP_VALUES.find((g) => g === groupParam);
  const entityParam = getParam(sp, "entity");
  const entity = AUDIT_ENTITY_VALUES.find((e) => e === entityParam);
  const companyParam = getParam(sp, "company");
  const companyId = actor.role === "GROUP_ADMIN" && companyParam ? companyParam.slice(0, 50) : undefined;

  const and: Prisma.AuditLogWhereInput[] = [
    auditScopeWhere(actor),
    { createdAt: { gte: vnDayStart(from), lt: vnDayStart(addDaysIso(to, 1)) } },
  ];
  if (companyId) and.push({ companyId });
  if (q) {
    and.push({
      actor: {
        OR: [
          { fullName: { contains: q, mode: "insensitive" } },
          { employeeCode: { contains: q, mode: "insensitive" } },
        ],
      },
    });
  }
  if (group) and.push(auditGroupWhere(group));
  if (entity) and.push({ entityType: entity });

  const filters: AuditFilters = { from, to, q, group, entity, companyId };
  return { where: { AND: and } satisfies Prisma.AuditLogWhereInput, filters };
}

export const AUDIT_LOG_SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entityType: true,
  entityId: true,
  companyId: true,
  metadata: true,
  actor: { select: { id: true, fullName: true, employeeCode: true } },
} satisfies Prisma.AuditLogSelect;

type RawAuditLog = Prisma.AuditLogGetPayload<{ select: typeof AUDIT_LOG_SELECT }>;

/** 1 dòng nhật ký đã kèm nhãn, công ty, tên đối tượng — dùng cho bảng, panel, Excel. */
export type AuditLogRow = {
  id: string;
  createdAt: Date;
  action: string;
  label: string;
  group: AuditGroup;
  summary: string | null;
  entityType: string;
  entityTypeLabel: string;
  entityId: string | null;
  entity: { label: string; href: string | null } | null;
  actor: { id: string; fullName: string; employeeCode: string } | null;
  company: { id: string; code: string; name: string } | null;
  metadata: Prisma.JsonValue;
};

function meta(value: Prisma.JsonValue): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

const str = (v: unknown) => (typeof v === "string" && v ? v : null);
const asObj = (v: unknown) => meta((v ?? null) as Prisma.JsonValue);

/** Tra tên / mã đối tượng + công ty theo lô (mỗi loại 1 truy vấn). */
export async function enrichAuditLogs(actor: CurrentUser, logs: RawAuditLog[]): Promise<AuditLogRow[]> {
  const ids = (type: string) => [...new Set(logs.filter((l) => l.entityType === type && l.entityId).map((l) => l.entityId!))];
  const companyIds = [
    ...new Set([...logs.map((l) => l.companyId).filter((v): v is string => !!v), ...ids("Company")]),
  ];

  const [users, departments, companies, positions, categories, courses] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids("User") } }, select: { id: true, fullName: true, employeeCode: true } }),
    prisma.department.findMany({
      where: { id: { in: ids("Department") } },
      select: { id: true, code: true, name: true, companyId: true },
    }),
    prisma.company.findMany({ where: { id: { in: companyIds } }, select: { id: true, code: true, name: true } }),
    prisma.position.findMany({ where: { id: { in: ids("Position") } }, select: { id: true, code: true, name: true } }),
    prisma.courseCategory.findMany({ where: { id: { in: ids("CourseCategory") } }, select: { id: true, name: true } }),
    prisma.course.findMany({ where: { id: { in: ids("Course") } }, select: { id: true, code: true, title: true } }),
  ]);
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const userById = new Map(users.map((u) => [u.id, u]));
  const departmentById = new Map(departments.map((d) => [d.id, d]));
  const companyById = new Map(companies.map((c) => [c.id, c]));
  const positionById = new Map(positions.map((p) => [p.id, p]));
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  return logs.map((log) => {
    const m = meta(log.metadata);
    let entity: AuditLogRow["entity"] = null;
    const id = log.entityId;

    switch (log.entityType) {
      case "User": {
        const u = id ? userById.get(id) : undefined;
        if (u) entity = { label: `${u.fullName} (${u.employeeCode})`, href: `/org/users/${u.id}` };
        else if (log.action === "USERS_IMPORTED") {
          const count = Number(m.created ?? 0) + Number(m.updated ?? 0);
          entity = { label: `${count} người dùng`, href: null };
        } else if (str(m.employeeCode)) entity = { label: str(m.employeeCode)!, href: null };
        break;
      }
      case "Department": {
        const d = id ? departmentById.get(id) : undefined;
        if (d) {
          entity = {
            label: `${d.name} (${d.code})`,
            href: `/org/departments?${new URLSearchParams({ company: d.companyId, q: d.code })}`,
          };
        } else if (str(m.code) || str(m.departmentCode)) entity = { label: str(m.code) ?? str(m.departmentCode)!, href: null };
        break;
      }
      case "Company": {
        const c = id ? companyById.get(id) : undefined;
        if (c) {
          entity = {
            label: `${c.name} (${c.code})`,
            // Trang Công ty con chỉ dành cho Admin tập đoàn
            href: isGroupAdmin ? `/system/companies?${new URLSearchParams({ q: c.code })}` : null,
          };
        } else if (str(m.code)) entity = { label: str(m.code)!, href: null };
        break;
      }
      case "Enrollment": {
        const label = [str(m.learnerName), str(m.courseCode)].filter(Boolean).join(" — ");
        if (label) entity = { label, href: null };
        break;
      }
      case "AssignmentRule": {
        const name = str(m.ruleName) ?? str(asObj(m.after).name);
        if (name) entity = { label: name, href: id ? `/assign/rules/${id}` : null };
        break;
      }
      case "CourseSection":
      case "Lesson": {
        const title = str(log.entityType === "Lesson" ? m.lessonTitle : m.sectionTitle);
        const courseId = str(m.courseId);
        const courseCode = str(m.courseCode);
        if (title) {
          entity = {
            label: courseCode ? `${title} — ${courseCode}` : title,
            href: courseId ? `/content/courses/${courseId}?tab=content` : null,
          };
        }
        break;
      }
      case "Course": {
        const c = id ? courseById.get(id) : undefined;
        if (c) entity = { label: `${c.title} (${c.code})`, href: `/content/courses/${c.id}` };
        else if (str(m.code)) entity = { label: str(m.code)!, href: null };
        break;
      }
      case "CourseCategory": {
        const c = id ? categoryById.get(id) : undefined;
        const name = c?.name ?? str(m.name) ?? str(asObj(m.after).name);
        if (name) entity = { label: name, href: `/content/categories?${new URLSearchParams({ q: name })}` };
        break;
      }
      case "Position": {
        const p = id ? positionById.get(id) : undefined;
        if (p) entity = { label: `${p.name} (${p.code})`, href: `/org/positions?${new URLSearchParams({ q: p.code })}` };
        else if (str(m.code)) entity = { label: str(m.code)!, href: null };
        break;
      }
    }

    const company = log.companyId ? companyById.get(log.companyId) ?? null : null;
    return {
      id: log.id,
      createdAt: log.createdAt,
      action: log.action,
      label: auditActionLabel(log.action, log.metadata),
      group: auditActionGroup(log.action, log.metadata),
      summary: describeAuditEntry(log.action, log.metadata),
      entityType: log.entityType,
      entityTypeLabel: ENTITY_LABELS[log.entityType as AuditEntityType] ?? log.entityType,
      entityId: log.entityId,
      entity,
      actor: log.actor,
      company,
      metadata: log.metadata,
    };
  });
}

/** Chi tiết 1 dòng (panel bên phải): kiểm tra phạm vi + đổi các id trong metadata thành “Tên (mã)”. */
export async function getAuditLogDetail(actor: CurrentUser, logId: string) {
  if (!logId || logId.length > 50) return null;
  const log = await prisma.auditLog.findFirst({
    where: { id: logId, ...auditScopeWhere(actor) },
    select: AUDIT_LOG_SELECT,
  });
  if (!log) return null;
  const [row] = await enrichAuditLogs(actor, [log]);

  // Thu thập giá trị của các khoá *Id (kể cả trong before / after)
  const idValues = new Set<string>();
  const collect = (value: unknown) => {
    for (const [key, v] of Object.entries(meta(value as Prisma.JsonValue))) {
      if (/Id$/.test(key) && typeof v === "string" && v) idValues.add(v);
      else if (v && typeof v === "object" && !Array.isArray(v)) collect(v);
    }
  };
  collect(log.metadata);

  const resolved: Record<string, string> = {};
  if (idValues.size > 0) {
    const list = [...idValues];
    const [users, departments, companies, positions, categories] = await Promise.all([
      prisma.user.findMany({ where: { id: { in: list } }, select: { id: true, fullName: true, employeeCode: true } }),
      prisma.department.findMany({ where: { id: { in: list } }, select: { id: true, code: true, name: true } }),
      prisma.company.findMany({ where: { id: { in: list } }, select: { id: true, code: true, name: true } }),
      prisma.position.findMany({ where: { id: { in: list } }, select: { id: true, code: true, name: true } }),
      prisma.courseCategory.findMany({ where: { id: { in: list } }, select: { id: true, name: true } }),
    ]);
    for (const u of users) resolved[u.id] = `${u.fullName} (${u.employeeCode})`;
    for (const d of [...departments, ...companies, ...positions]) resolved[d.id] = `${d.name} (${d.code})`;
    for (const c of categories) resolved[c.id] = c.name;
  }

  return { ...row, resolved };
}

export type AuditLogDetail = NonNullable<Awaited<ReturnType<typeof getAuditLogDetail>>>;
