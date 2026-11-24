import "server-only";
import type { EnrollmentSource, EnrollmentStatus, Prisma } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { notify as notifyUsers } from "@/lib/notifications";
import { getGroupCompanyId } from "@/lib/course-scope";
import { prisma } from "@/lib/db";
import { dueAfterDays, vnIsoDate } from "@/lib/format";
import { getSetting } from "@/lib/settings";
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
  /** Hạn chung, hoặc hàm tính hạn cho từng người. null = không hạn (tự đăng ký — Việc 24) */
  due: Date | null | ((userId: string) => Date);
  source: EnrollmentSource;
  assignedById?: string | null;
  assignmentRuleId?: string | null;
  /** Người thao tác ghi vào nhật ký (null = Hệ thống tự giao) */
  actorId: string | null;
  /** Giao trong 1 lộ trình: gắn learningPathId cho lượt mới / kích hoạt lại / lượt đã có chưa gắn lộ trình */
  learningPathId?: string | null;
  /** false = không gửi thông báo từng khoá (giao lộ trình gửi 1 thông báo chung). Mặc định true */
  notify?: boolean;
};

const emptyCounts = (): AssignCounts => ({ created: 0, shortened: 0, unchanged: 0, completed: 0, reactivated: 0, skipped: 0 });

type Decision =
  | { kind: "create"; userId: string; dueDate: Date | null }
  | { kind: "shorten"; enrollmentId: string; userId: string; dueDate: Date }
  | { kind: "unchanged" | "completed"; userId: string }
  | { kind: "reactivate"; enrollmentId: string; userId: string; dueDate: Date | null };

type Learner = { id: string; companyId: string };

async function loadCourse(courseId: string) {
  return prisma.course.findUnique({ where: { id: courseId }, select: { id: true, code: true, title: true, status: true } });
}

/** Học viên hợp lệ (đang làm + công ty hoạt động) trong danh sách id. */
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
    // Đang học / chưa bắt đầu: chỉ rút ngắn hạn (không có hạn cũ = coi như hạn mới sớm hơn; giao không hạn = giữ nguyên)
    if (dueDate && (!e.dueDate || dueDate < e.dueDate)) return { kind: "shorten", enrollmentId: e.id, userId: l.id, dueDate };
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
 * ghi nhật ký ENROLLMENTS_ASSIGNED — 1 dòng cho mỗi công ty của học viên (Admin công ty thấy được trong phạm vi mình).
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
  const learningPathId = input.learningPathId ?? null;
  // Tự đăng ký (SELF): không thông báo, không ghi nhật ký (Việc 24)
  const isSelf = input.source === "SELF";
  const sendNotify = input.notify !== false && !isSelf;

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
        creates.push({
          userId: d.userId,
          courseId: course.id,
          source: input.source,
          assignedById,
          assignmentRuleId,
          learningPathId,
          dueDate: d.dueDate,
        });
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
              ...(learningPathId && { learningPathId }),
              progressPercent: 0,
              startedAt: null,
              completedAt: null,
            },
          }),
        );
        notify.push(d.userId);
      }
    }

    // Giao theo lộ trình: lượt đã có (kể cả đã hoàn thành) chưa gắn lộ trình -> gắn, giữ nguyên trạng thái
    if (learningPathId) {
      ops.push(
        prisma.enrollment.updateMany({
          where: { courseId: course.id, userId: { in: batch.map((l) => l.id) }, learningPathId: null, status: { not: "CANCELLED" } },
          data: { learningPathId },
        }),
      );
    }

    if (creates.length === 0 && ops.length === 0) continue;
    await prisma.$transaction([
      // skipDuplicates: chống trùng khi 2 lượt giao chạy cùng lúc (@@unique userId + courseId)
      ...(creates.length > 0 ? [prisma.enrollment.createMany({ data: creates, skipDuplicates: true })] : []),
      ...ops,
      ...(sendNotify && notify.length > 0
        ? [notifyUsers(prisma, { userIds: notify, type: "COURSE_ASSIGNED", title, link: "/my-courses" })]
        : []),
    ]);
  }

  // Nhật ký: mỗi công ty 1 dòng
  if (isSelf) return total;
  const dueSample = input.due instanceof Date ? vnIsoDate(input.due) : null;
  const pathCode = learningPathId
    ? (await prisma.learningPath.findUnique({ where: { id: learningPathId }, select: { code: true } }))?.code
    : null;
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
        ...(learningPathId && { learningPathId, pathCode: pathCode ?? null }),
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
    const defaultDays = await getSetting("DEFAULT_DUE_DAYS");

    // Điều kiện tổ chức dùng chung cho quy tắc khoá và quy tắc lộ trình
    const orgMatch: Prisma.AssignmentRuleWhereInput[] = [
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
    ];

    // Quy tắc giao LỘ TRÌNH: lộ trình đã phát hành; lộ trình của công ty con chỉ áp dụng trong công ty đó
    const pathRules = await prisma.assignmentRule.findMany({
      where: {
        isActive: true,
        learningPathId: { not: null },
        learningPath: { status: "PUBLISHED" },
        AND: [
          ...orgMatch,
          {
            OR: [
              { learningPath: { ownerCompanyId: groupId ?? "__none__" } },
              { learningPath: { ownerCompanyId: user.companyId } },
            ],
          },
        ],
      },
      select: { id: true, learningPathId: true, dueInDays: true },
    });
    for (const rule of pathRules) {
      await assignPath({
        learningPathId: rule.learningPathId!,
        userIds: [user.id],
        due: dueAfterDays(rule.dueInDays ?? defaultDays),
        source: "RULE",
        assignmentRuleId: rule.id,
        actorId: null,
      });
    }

    const rules = await prisma.assignmentRule.findMany({
      where: {
        isActive: true,
        courseId: { not: null },
        course: { status: "PUBLISHED" },
        AND: [
          ...orgMatch,
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

// ---------------------------------------------------------------------------------------------
// Lộ trình học (Việc 23A) — giao lộ trình = giao từng khoá theo thứ tự, gắn learningPathId, CÙNG 1 HẠN

export type PathAssignInput = Omit<AssignInput, "courseId" | "learningPathId" | "notify"> & { learningPathId: string };

export type PathPreview = {
  /** Chưa có lộ trình này -> được giao mới */
  newLearners: number;
  /** Đã có lộ trình (có lượt học chưa huỷ gắn lộ trình) */
  alreadyHasPath: number;
  /** Đã hoàn thành mọi khoá của lộ trình */
  completedAll: number;
  /** Bỏ qua: tài khoản khoá / công ty tạm ngưng / không tồn tại */
  skipped: number;
};

async function loadPath(learningPathId: string) {
  return prisma.learningPath.findUnique({
    where: { id: learningPathId },
    select: {
      id: true,
      code: true,
      title: true,
      status: true,
      courses: { orderBy: { sortOrder: "asc" }, select: { courseId: true, course: { select: { status: true } } } },
    },
  });
}

/** Người (trong danh sách) đang có lộ trình: có lượt học chưa huỷ gắn lộ trình. */
async function usersWithPath(learningPathId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.enrollment.findMany({
    where: { learningPathId, userId: { in: userIds }, status: { not: "CANCELLED" } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return new Set(rows.map((r) => r.userId));
}

/** Xem trước giao lộ trình: KHÔNG ghi gì. */
export async function previewPathAssignment(input: { learningPathId: string; userIds: string[] }): Promise<PathPreview> {
  const path = await loadPath(input.learningPathId);
  const learners = await loadLearners(input.userIds);
  const result: PathPreview = {
    newLearners: 0,
    alreadyHasPath: 0,
    completedAll: 0,
    skipped: new Set(input.userIds).size - learners.length,
  };
  if (!path) return result;
  const courseIds = path.courses.map((c) => c.courseId);
  for (let i = 0; i < learners.length; i += BATCH_SIZE) {
    const ids = learners.slice(i, i + BATCH_SIZE).map((l) => l.id);
    const [has, completed] = await Promise.all([
      usersWithPath(path.id, ids),
      prisma.enrollment.groupBy({
        by: ["userId"],
        where: { userId: { in: ids }, courseId: { in: courseIds }, status: "COMPLETED" },
        _count: { _all: true },
      }),
    ]);
    const doneAll = new Set(
      completed.filter((c) => courseIds.length > 0 && c._count._all >= courseIds.length).map((c) => c.userId),
    );
    for (const id of ids) {
      if (doneAll.has(id)) result.completedAll++;
      else if (has.has(id)) result.alreadyHasPath++;
      else result.newLearners++;
    }
  }
  return result;
}

/**
 * Giao lộ trình: từng khoá theo thứ tự -> assignCourse (gắn learningPathId, không thông báo từng khoá, cùng 1 hạn).
 * Lượt đã có giữ nguyên trạng thái (đã COMPLETED tính là xong). Người chưa có lộ trình nhận 1 thông báo chung.
 */
export async function assignPath(input: PathAssignInput): Promise<AssignCounts & { newLearners: number }> {
  const path = await loadPath(input.learningPathId);
  if (!path || path.status !== "PUBLISHED") throw new Error("Lộ trình không tồn tại hoặc chưa phát hành.");

  const learners = await loadLearners(input.userIds);
  const learnerIds = learners.map((l) => l.id);
  const before = await usersWithPath(path.id, learnerIds);
  const total = emptyCounts();
  total.skipped = new Set(input.userIds).size - learners.length;

  for (const pc of path.courses) {
    // Khoá trong lộ trình bị lưu trữ / không còn phát hành: bỏ qua (trang lộ trình có cảnh báo)
    if (pc.course.status !== "PUBLISHED") continue;
    const c = await assignCourse({
      ...input,
      courseId: pc.courseId,
      userIds: learnerIds,
      learningPathId: path.id,
      notify: false,
    });
    for (const k of ["created", "shortened", "unchanged", "completed", "reactivated"] as const) total[k] += c[k];
  }

  const newcomers = learnerIds.filter((id) => !before.has(id));
  if (newcomers.length > 0) {
    await notifyUsers(prisma, {
      userIds: newcomers,
      type: "COURSE_ASSIGNED",
      title: `Bạn được giao lộ trình “${path.title}”`.slice(0, 250),
      link: `/learning-paths/${path.id}`,
      dedupeKey: `path_assigned:${path.id}`,
    });
  }
  return { ...total, newLearners: newcomers.length };
}

/**
 * Thêm khoá vào cuối lộ trình ĐÃ PHÁT HÀNH: giao khoá đó cho mọi người đang có lộ trình, hạn = hạn hiện tại của họ
 * trong lộ trình (hạn muộn nhất của các lượt gắn lộ trình; không có hạn -> hôm nay + DEFAULT_DUE_DAYS).
 * Trả số người được giao thêm (giao mới + kích hoạt lại).
 */
export async function assignAppendedCourse(input: { learningPathId: string; courseId: string; actorId: string }): Promise<number> {
  const rows = await prisma.enrollment.groupBy({
    by: ["userId"],
    where: { learningPathId: input.learningPathId, status: { not: "CANCELLED" } },
    _max: { dueDate: true },
  });
  if (rows.length === 0) return 0;
  const fallback = dueAfterDays(await getSetting("DEFAULT_DUE_DAYS"));
  const dueOf = new Map(rows.map((r) => [r.userId, r._max.dueDate ?? fallback]));
  const counts = await assignCourse({
    courseId: input.courseId,
    userIds: rows.map((r) => r.userId),
    due: (userId) => dueOf.get(userId) ?? fallback,
    source: "ASSIGNED",
    assignedById: input.actorId,
    actorId: input.actorId,
    learningPathId: input.learningPathId,
  });
  return counts.created + counts.reactivated;
}

/** Số người đang có lộ trình (lượt học chưa huỷ gắn lộ trình). */
export async function countPathLearners(learningPathId: string): Promise<number> {
  const rows = await prisma.enrollment.findMany({
    where: { learningPathId, status: { not: "CANCELLED" } },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}
