import type { EnrollmentSource, EnrollmentStatus, Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { getGroupCompanyId } from "@/lib/course-scope";
import { prisma } from "@/lib/db";
import { dueAfterDays, vnIsoDate } from "@/lib/format";
import { getNumberSetting } from "@/lib/settings";
import { getAncestorIds } from "@/lib/tree";

/**
 * Giao khoá học (docs/database.md — Quy tắc 3). Chỉ chạy ở server, dùng chung cho giao thủ công,
 * giao tự động theo quy tắc và tự giao cho người vào sau (onUserOrgChanged).
 *
 * Mỗi người – mỗi khoá 1 enrollment:
 * - chưa có                   -> tạo mới NOT_STARTED
 * - NOT_STARTED / IN_PROGRESS -> giữ nguyên, chỉ RÚT NGẮN hạn nếu hạn mới sớm hơn
 * - COMPLETED                 -> bỏ qua
 * - CANCELLED                 -> kích hoạt lại: NOT_STARTED, hạn mới, cách giao / người giao / quy tắc mới
 * Bỏ qua người đã khoá (INACTIVE) hoặc thuộc công ty tạm ngưng.
 */

const BATCH_SIZE = 500;

export type AssignCounts = {
  /** Giao mới */
  created: number;
  /** Đã có, rút ngắn hạn */
  shortened: number;
  /** Đã có (đang học / chưa bắt đầu), giữ nguyên */
  unchanged: number;
  /** Đã hoàn thành, bỏ qua */
  completed: number;
  /** Đã huỷ trước đó, kích hoạt lại */
  reactivated: number;
  /** Bỏ qua: tài khoản khoá / công ty tạm ngưng / không tồn tại */
  skipped: number;
};

export type AssignInput = {
  courseId: string;
  userIds: string[];
  /** Hạn chung, hoặc hàm tính hạn cho từng người */
  due: Date | ((userId: string) => Date);
  source: EnrollmentSource;
  assignedById?: string | null;
  assignmentRuleId?: string | null;
  /** Người thao tác ghi vào nhật ký (null = Hệ thống tự giao) */
  actorId: string | null;
};

const emptyCounts = (): AssignCounts => ({ created: 0, shortened: 0, unchanged: 0, completed: 0, reactivated: 0, skipped: 0 });

type Decision =
  | { kind: "create"; userId: string; dueDate: Date }
  | { kind: "shorten"; enrollmentId: string; userId: string; dueDate: Date }
  | { kind: "unchanged" | "completed"; userId: string }
  | { kind: "reactivate"; enrollmentId: string; userId: string; dueDate: Date };

type Learner = { id: string; companyId: string };

async function loadCourse(courseId: string) {
  return prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, status: true } });
}

/** Người học hợp lệ (đang làm + công ty hoạt động) trong danh sách id. */
async function loadLearners(userIds: string[]): Promise<Learner[]> {
  const unique = [...new Set(userIds)];
  const result: Learner[] = [];
  for (let i = 0; i < unique.length; i += 5000) {
    result.push(
      ...(await prisma.user.findMany({
        where: { id: { in: unique.slice(i, i + 5000) }, status: "ACTIVE", company: { isActive: true } },
        select: { id: true, companyId: true },
      })),
    );
  }
  return result;
}

function decide(
  learners: Learner[],
  existing: Map<string, { id: string; status: EnrollmentStatus; dueDate: Date | null }>,
  due: AssignInput["due"],
): Decision[] {
  return learners.map((l) => {
    const dueDate = typeof due === "function" ? due(l.id) : due;
    const e = existing.get(l.id);
    if (!e) return { kind: "create", userId: l.id, dueDate };
    if (e.status === "COMPLETED") return { kind: "completed", userId: l.id };
    if (e.status === "CANCELLED") return { kind: "reactivate", enrollmentId: e.id, userId: l.id, dueDate };
    // Đang học / chưa bắt đầu: chỉ rút ngắn hạn (không có hạn cũ = coi như hạn mới sớm hơn)
    if (!e.dueDate || dueDate < e.dueDate) return { kind: "shorten", enrollmentId: e.id, userId: l.id, dueDate };
    return { kind: "unchanged", userId: l.id };
  });
}

const KIND_TO_COUNT = {
  create: "created",
  shorten: "shortened",
  unchanged: "unchanged",
  completed: "completed",
  reactivate: "reactivated",
} as const;

async function loadExisting(courseId: string, userIds: string[]) {
  const rows = await prisma.enrollment.findMany({
    where: { courseId, userId: { in: userIds } },
    select: { id: true, userId: true, status: true, dueDate: true },
  });
  return new Map(rows.map((r) => [r.userId, r]));
}

/** Xem trước: phân loại như assignCourse nhưng KHÔNG ghi gì. */
export async function previewAssignment(input: Pick<AssignInput, "courseId" | "userIds" | "due">): Promise<AssignCounts> {
  const counts = emptyCounts();
  const learners = await loadLearners(input.userIds);
  counts.skipped = new Set(input.userIds).size - learners.length;
  for (let i = 0; i < learners.length; i += BATCH_SIZE) {
    const batch = learners.slice(i, i + BATCH_SIZE);
    const existing = await loadExisting(input.courseId, batch.map((l) => l.id));
    for (const d of decide(batch, existing, input.due)) counts[KIND_TO_COUNT[d.kind]]++;
  }
  return counts;
}

/**
 * Giao khoá: ghi theo lô 500 người / transaction, tạo thông báo COURSE_ASSIGNED cho người được giao mới / kích hoạt lại,
 * ghi nhật ký ENROLLMENTS_ASSIGNED — 1 dòng cho mỗi công ty của người học (Admin công ty thấy được trong phạm vi mình).
 * Khoá phải đang PUBLISHED (người gọi kiểm tra trước; ở đây chặn lại lần nữa).
 */
export async function assignCourse(input: AssignInput): Promise<AssignCounts> {
  const course = await loadCourse(input.courseId);
  if (!course || course.status !== "PUBLISHED") throw new Error("Khoá học không tồn tại hoặc chưa phát hành.");

  const total = emptyCounts();
  const learners = await loadLearners(input.userIds);
  total.skipped = new Set(input.userIds).size - learners.length;
  const companyOf = new Map(learners.map((l) => [l.id, l.companyId]));
  const perCompany = new Map<string, AssignCounts>();
  const assignedById = input.assignedById ?? null;
  const assignmentRuleId = input.assignmentRuleId ?? null;
  const title = `Bạn được giao khoá học: ${course.title}`.slice(0, 250);

  for (let i = 0; i < learners.length; i += BATCH_SIZE) {
    const batch = learners.slice(i, i + BATCH_SIZE);
    const existing = await loadExisting(course.id, batch.map((l) => l.id));
    const decisions = decide(batch, existing, input.due);

    const creates: Prisma.EnrollmentCreateManyInput[] = [];
    const ops: Prisma.PrismaPromise<unknown>[] = [];
    const notify: string[] = [];
    for (const d of decisions) {
      const c = perCompany.get(companyOf.get(d.userId)!) ?? emptyCounts();
      c[KIND_TO_COUNT[d.kind]]++;
      perCompany.set(companyOf.get(d.userId)!, c);
      total[KIND_TO_COUNT[d.kind]]++;

      if (d.kind === "create") {
        creates.push({ userId: d.userId, courseId: course.id, source: input.source, assignedById, assignmentRuleId, dueDate: d.dueDate });
        notify.push(d.userId);
      } else if (d.kind === "shorten") {
        ops.push(prisma.enrollment.update({ where: { id: d.enrollmentId }, data: { dueDate: d.dueDate } }));
      } else if (d.kind === "reactivate") {
        ops.push(
          prisma.enrollment.update({
            where: { id: d.enrollmentId },
            data: {
              status: "NOT_STARTED",
              dueDate: d.dueDate,
              source: input.source,
              assignedById,
              assignmentRuleId,
              progressPercent: 0,
              startedAt: null,
              completedAt: null,
            },
          }),
        );
        notify.push(d.userId);
      }
    }

    if (creates.length === 0 && ops.length === 0) continue;
    await prisma.$transaction([
      // skipDuplicates: chống trùng khi 2 lượt giao chạy cùng lúc (@@unique userId + courseId)
      ...(creates.length > 0 ? [prisma.enrollment.createMany({ data: creates, skipDuplicates: true })] : []),
      ...ops,
      ...(notify.length > 0
        ? [prisma.notification.createMany({ data: notify.map((userId) => ({ userId, type: "COURSE_ASSIGNED", title, link: "/my-courses" })) })]
        : []),
    ]);
  }

  // Nhật ký: mỗi công ty 1 dòng
  const dueSample = typeof input.due === "function" ? null : vnIsoDate(input.due);
  const rule = assignmentRuleId
    ? await prisma.assignmentRule.findUnique({ where: { id: assignmentRuleId }, select: { name: true } })
    : null;
  for (const [companyId, c] of perCompany) {
    // Không có gì thay đổi (VD sửa thông tin người đã có đủ lượt giao) -> không ghi nhật ký thừa
    if (c.created + c.shortened + c.reactivated === 0) continue;
    await logAudit(prisma, {
      actorId: input.actorId,
      companyId,
      action: "ENROLLMENTS_ASSIGNED",
      entityType: "Course",
      entityId: course.id,
      metadata: {
        courseId: course.id,
        courseCode: course.code,
        courseTitle: course.title,
        source: input.source,
        dueDate: dueSample,
        ...(assignmentRuleId && { ruleId: assignmentRuleId, ruleName: rule?.name ?? null }),
        created: c.created,
        shortened: c.shortened,
        unchanged: c.unchanged,
        completed: c.completed,
        reactivated: c.reactivated,
      },
    });
  }

  return total;
}

// ---------------------------------------------------------------------------------------------
// Tự giao cho người vào sau / đổi phòng ban, chức danh, công ty, mở khoá tài khoản

/**
 * Gọi NGOÀI transaction, sau khi dữ liệu người dùng đã lưu: tạo nhân viên, import, đổi phòng ban / chức danh /
 * công ty, mở khoá tài khoản. Tìm mọi quy tắc đang chạy khớp người này -> giao (source RULE, hạn hôm nay + N ngày,
 * nhật ký ghi “Hệ thống”). Người chuyển RA khỏi nhóm: giữ nguyên lượt đã giao. Lỗi chỉ ghi log, không làm hỏng
 * thao tác chính.
 */
export async function onUserOrgChanged(userId: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true, companyId: true, departmentId: true, positionId: true, company: { select: { isActive: true } } },
    });
    if (!user || user.status !== "ACTIVE" || !user.company.isActive) return;

    // Phòng của người này + mọi phòng cha / ông (quy tắc “gồm phòng con” đặt ở phòng cha vẫn khớp)
    let ancestors: string[] = [];
    if (user.departmentId) {
      const depts = await prisma.department.findMany({
        where: { companyId: user.companyId },
        select: { id: true, parentId: true },
      });
      ancestors = getAncestorIds(user.departmentId, new Map(depts.map((d) => [d.id, d.parentId])));
    }
    const groupId = await getGroupCompanyId();
    const defaultDays = await getNumberSetting("DEFAULT_DUE_DAYS", 30);

    const rules = await prisma.assignmentRule.findMany({
      where: {
        isActive: true,
        courseId: { not: null },
        course: { status: "PUBLISHED" },
        AND: [
          { OR: [{ targetCompanyId: null }, { targetCompanyId: user.companyId }] },
          { OR: [{ positionId: null }, { positionId: user.positionId ?? "__none__" }] },
          {
            OR: [
              { departmentId: null },
              ...(user.departmentId
                ? [
                    { departmentId: user.departmentId },
                    ...(ancestors.length > 0 ? [{ departmentId: { in: ancestors }, includeSubDepartments: true }] : []),
                  ]
                : []),
            ],
          },
          // Khoá của công ty con chỉ áp dụng trong công ty đó
          { OR: [{ course: { ownerCompanyId: groupId ?? "__none__" } }, { course: { ownerCompanyId: user.companyId } }] },
        ],
      },
      select: { id: true, courseId: true, dueInDays: true },
    });

    for (const rule of rules) {
      await assignCourse({
        courseId: rule.courseId!,
        userIds: [user.id],
        due: dueAfterDays(rule.dueInDays ?? defaultDays),
        source: "RULE",
        assignmentRuleId: rule.id,
        actorId: null,
      });
    }
  } catch (error) {
    console.error(`[assignment] Tự giao khoá cho người dùng ${userId} lỗi:`, error);
  }
}
