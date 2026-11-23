import { randomUUID } from "node:crypto";
import { PrismaClient, type EnrollmentStatus, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { PASSWORD, testEnv } from "./env";

/** Prisma tới elearning_test (env.ts đã chặn nếu tên database sai). Không dùng src/lib/db.ts (có "server-only"). */
export const db = new PrismaClient({ datasourceUrl: testEnv.DATABASE_URL });

/** Hậu tố ngắn, chữ IN HOA — mỗi test tạo dữ liệu có mã riêng để chạy song song không đụng nhau */
export const uid = () => randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();

export async function userByCode(code: string) {
  return db.user.findUniqueOrThrow({ where: { employeeCode: code }, include: { company: true } });
}
export async function companyByCode(code: string) {
  return db.company.findUniqueOrThrow({ where: { code } });
}
export async function departmentByCode(companyCode: string, code: string) {
  const company = await companyByCode(companyCode);
  return db.department.findUniqueOrThrow({ where: { companyId_code: { companyId: company.id, code } } });
}

type LessonSpec =
  | { type: "DOCUMENT"; title?: string }
  | { type: "VIDEO"; title?: string; duration?: number; minWatchPercent?: number }
  | { type: "QUIZ"; title?: string; questionCount?: number; passingScore?: number; maxAttempts?: number | null; showAnswers?: boolean };

/**
 * Tạo khoá ĐÃ PHÁT HÀNH (v1) có bài theo `lessons` (mỗi bài 1 chương nhỏ theo thứ tự) + ngân hàng câu hỏi cho bài kiểm tra.
 * Câu hỏi: 1 đáp án, phương án "a" luôn đúng (để test chọn được đáp án đúng / sai).
 */
export async function createCourse(opts: {
  ownerCompany?: string;
  code?: string;
  title?: string;
  /** Mặc định: 1 bài tài liệu */
  lessons?: LessonSpec[];
  hasCertificate?: boolean;
  certificateValidMonths?: number | null;
  allowSelfEnroll?: boolean;
  questions?: number;
}) {
  const owner = await companyByCode(opts.ownerCompany ?? "CTY1");
  const code = opts.code ?? `E2E-${uid()}`;
  const course = await db.course.create({
    data: {
      ownerCompanyId: owner.id,
      code,
      title: opts.title ?? `Khoá kiểm thử ${code}`,
      status: "PUBLISHED",
      currentVersion: 1,
      hasCertificate: opts.hasCertificate ?? false,
      certificateValidMonths: opts.certificateValidMonths ?? null,
      allowSelfEnroll: opts.allowSelfEnroll ?? false,
      versions: { create: { versionNo: 1, changeType: "INITIAL", status: "PUBLISHED", publishedAt: new Date() } },
    },
  });
  const section = await db.courseSection.create({ data: { courseId: course.id, title: "Chương 1" } });
  const lessons = [];
  const specs: LessonSpec[] = opts.lessons ?? [{ type: "DOCUMENT" }];
  for (const [i, l] of specs.entries()) {
    const base = { sectionId: section.id, sortOrder: i, title: l.title ?? `Bài ${i + 1}` };
    const data: Prisma.LessonUncheckedCreateInput =
      l.type === "DOCUMENT"
        ? { ...base, type: "DOCUMENT", content: `<p>Nội dung ${base.title}</p>` }
        : l.type === "VIDEO"
          ? { ...base, type: "VIDEO", videoProvider: "YOUTUBE", videoId: "M7lc1UVf-VE", videoStatus: "READY", durationSeconds: l.duration ?? 60, minWatchPercent: l.minWatchPercent ?? 90 }
          : { ...base, type: "QUIZ", questionCount: l.questionCount ?? 2, passingScore: l.passingScore ?? 100, timeLimitMinutes: 15, maxAttempts: l.maxAttempts === undefined ? 2 : l.maxAttempts, showAnswers: l.showAnswers ?? true };
    lessons.push(await db.lesson.create({ data }));
  }
  const nq = opts.questions ?? (specs.some((l) => l.type === "QUIZ") ? 2 : 0);
  for (let i = 0; i < nq; i++) {
    await db.question.create({
      data: {
        courseId: course.id,
        type: "SINGLE",
        content: `Câu hỏi ${i + 1} của ${code}?`,
        options: [
          { id: "a", text: "Đáp án đúng", isCorrect: true },
          { id: "b", text: "Đáp án sai", isCorrect: false },
        ],
        explanation: "Giải thích mẫu",
      },
    });
  }
  return { course, lessons };
}

/** Lượt học (mặc định NOT_STARTED, ASSIGNED, hạn +30 ngày) */
export async function enroll(userCode: string, courseId: string, data: Partial<Prisma.EnrollmentUncheckedCreateInput> & { status?: EnrollmentStatus } = {}) {
  const u = await userByCode(userCode);
  return db.enrollment.create({
    data: { userId: u.id, courseId, source: "ASSIGNED", dueDate: daysFromNow(30), ...data },
  });
}

export const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000);

/** Học viên MỚI riêng cho 1 test (không đụng dữ liệu các test chạy song song) — mặc định phòng KD của CTY1 (đội của TEST-MG1) */
export async function createLearner(opts: { company?: string; department?: string; fullName?: string } = {}) {
  const u = uid();
  const department = await departmentByCode(opts.company ?? "CTY1", opts.department ?? "KD");
  return db.user.create({
    data: {
      employeeCode: `E2E-HV-${u}`,
      fullName: opts.fullName ?? `Học viên riêng ${u}`,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
      mustChangePassword: false,
      companyId: department.companyId,
      departmentId: department.id,
    },
  });
}

/** Số dòng audit_logs khớp điều kiện */
export async function auditCount(where: Prisma.AuditLogWhereInput) {
  return db.auditLog.count({ where });
}

/** Đưa tài khoản về trạng thái ban đầu (đang làm, mật khẩu chung, không khoá tạm) — để chạy lại test không cần seed */
export async function resetAccount(code: string, opts: { mustChangePassword?: boolean } = {}) {
  await db.user.update({
    where: { employeeCode: code },
    data: {
      status: "ACTIVE",
      passwordHash: await bcrypt.hash(PASSWORD, 12),
      mustChangePassword: opts.mustChangePassword ?? false,
      failedLoginCount: 0,
      lockedUntil: null,
      sessionsValidAfter: null,
    },
  });
}
