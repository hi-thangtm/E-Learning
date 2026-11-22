/**
 * Đo thời gian chạy các tab Báo cáo (Việc 27) với dữ liệu lớn:   npx tsx --env-file=.env scripts/bench-reports.ts
 *
 * Trong 1 transaction: tạo TẠM 1 công ty + 10 phòng ban + 1.000 người + 50 khoá (mỗi khoá 1 bài kiểm tra) + 50.000 lượt học
 * + ~30.000 lượt làm bài + ~8.000 chứng nhận + ~25.000 tiến độ bài, chạy từng truy vấn báo cáo (Admin tập đoàn, lọc theo công ty tạm),
 * và các truy vấn Dashboard tập đoàn, in thời gian, rồi ROLLBACK — không để lại dữ liệu nào trong database.
 */
import { randomUUID } from "node:crypto";
import type { EnrollmentStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getAttentionCourses, getCompanyStats, getMonthlyCompletions } from "@/lib/group-dashboard";
import {
  certificateReport,
  courseLearners,
  courseReport,
  departmentReport,
  memberReport,
  parseReportFilters,
  resolveReportContext,
  versionReport,
} from "@/lib/reports";

const USERS = 1000;
const COURSES = 50;
const DAY = 86_400_000;
class Rollback extends Error {}

const id = () => randomUUID().replace(/-/g, "").slice(0, 25);

async function seed(tx: Prisma.TransactionClient) {
  const tag = `BENCH${Date.now().toString(36).toUpperCase()}`;
  const company = await tx.company.create({ data: { code: tag, name: `Công ty đo hiệu năng ${tag}` }, select: { id: true } });
  const depts = Array.from({ length: 10 }, (_, i) => ({ id: id(), companyId: company.id, code: `D${i}`, name: `Phòng ${i}`, parentId: null as string | null }));
  for (let i = 3; i < 10; i++) depts[i].parentId = depts[i % 3].id; // 3 phòng cha, 7 phòng con
  await tx.department.createMany({ data: depts });

  const users = Array.from({ length: USERS }, (_, i) => ({
    id: id(),
    employeeCode: `${tag}-${i}`,
    passwordHash: "x",
    fullName: `Nhân viên ${i}`,
    companyId: company.id,
    departmentId: depts[i % 10].id,
  }));
  await tx.user.createMany({ data: users });

  const category = await tx.courseCategory.create({ data: { name: `Danh mục ${tag}` }, select: { id: true } });
  const courses = Array.from({ length: COURSES }, (_, i) => ({
    id: id(),
    ownerCompanyId: company.id,
    categoryId: category.id,
    code: `${tag}-C${i}`,
    title: `Khoá đo ${i}`,
    status: "PUBLISHED" as const,
    currentVersion: i % 5 === 0 ? 2 : 1,
  }));
  await tx.course.createMany({ data: courses });
  await tx.courseVersion.createMany({
    data: courses.flatMap((c) => [
      { courseId: c.id, versionNo: 1, changeType: "INITIAL" as const, publishedAt: new Date(Date.now() - 200 * DAY) },
      ...(c.currentVersion === 2 ? [{ courseId: c.id, versionNo: 2, changeType: "MINOR" as const, publishedAt: new Date(Date.now() - 10 * DAY) }] : []),
    ]),
  });
  const sections = courses.map((c) => ({ id: id(), courseId: c.id, title: "Chương 1" }));
  await tx.courseSection.createMany({ data: sections });
  const lessons = sections.map((s) => ({ id: id(), sectionId: s.id, title: "Bài kiểm tra", type: "QUIZ" as const }));
  await tx.lesson.createMany({ data: lessons });

  const statuses: EnrollmentStatus[] = ["COMPLETED", "COMPLETED", "IN_PROGRESS", "NOT_STARTED"];
  const enrollments: Prisma.EnrollmentCreateManyInput[] = [];
  const attempts: Prisma.QuizAttemptCreateManyInput[] = [];
  const certs: Prisma.CertificateCreateManyInput[] = [];
  const progress: Prisma.LessonProgressCreateManyInput[] = [];
  users.forEach((u, ui) => {
    courses.forEach((c, ci) => {
      const status = statuses[(ui + ci) % 4];
      const created = new Date(Date.now() - ((ui * 7 + ci * 3) % 180) * DAY);
      enrollments.push({
        userId: u.id,
        courseId: c.id,
        source: (ui + ci) % 10 === 0 ? "SELF" : "ASSIGNED",
        status,
        progressPercent: status === "COMPLETED" ? 100 : status === "IN_PROGRESS" ? 40 : 0,
        dueDate: (ui + ci) % 10 === 0 ? null : new Date(created.getTime() + 30 * DAY),
        createdAt: created,
        completedAt: status === "COMPLETED" ? new Date(created.getTime() + 12 * DAY) : null,
        completedVersion: status === "COMPLETED" ? 1 : null,
        acknowledgedVersion: status === "COMPLETED" ? ((ui + ci) % 3 === 0 ? c.currentVersion : 1) : null,
      });
      if (status !== "NOT_STARTED") {
        const lessonId = lessons[ci].id;
        progress.push({ userId: u.id, lessonId, isCompleted: status === "COMPLETED" });
        const n = status === "COMPLETED" ? 1 + ((ui + ci) % 2) : 1;
        for (let a = 1; a <= n; a++) {
          const score = 50 + ((ui * 13 + ci * 7 + a * 11) % 51);
          attempts.push({ lessonId, userId: u.id, courseVersion: c.currentVersion, attemptNo: a, answers: [], score, passed: score >= 70, submittedAt: created });
        }
        if (status === "COMPLETED" && ci % 3 === 0) {
          certs.push({
            code: `${tag}-${ui}-${ci}`,
            userId: u.id,
            courseId: c.id,
            courseVersion: 1,
            recipientName: u.fullName,
            courseTitle: c.title,
            issuedAt: new Date(Date.now() - 300 * DAY),
            expiresAt: new Date(Date.now() + (((ui + ci) % 150) - 30) * DAY),
          });
        }
      }
    });
  });
  for (let i = 0; i < enrollments.length; i += 5000) await tx.enrollment.createMany({ data: enrollments.slice(i, i + 5000) });
  for (let i = 0; i < attempts.length; i += 5000) await tx.quizAttempt.createMany({ data: attempts.slice(i, i + 5000) });
  for (let i = 0; i < progress.length; i += 5000) await tx.lessonProgress.createMany({ data: progress.slice(i, i + 5000) });
  for (let i = 0; i < certs.length; i += 5000) await tx.certificate.createMany({ data: certs.slice(i, i + 5000) });
  await tx.$executeRaw`ANALYZE`;
  console.log(
    `Dữ liệu tạm: ${USERS} người, ${COURSES} khoá, ${enrollments.length} lượt học, ${attempts.length} lượt làm bài, ${progress.length} tiến độ, ${certs.length} chứng nhận`,
  );
  return { companyId: company.id, courseIds: courses.map((c) => c.id) };
}

async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const rows = Array.isArray(result) ? result.length : ((result as { rows?: unknown[] } | null)?.rows?.length ?? 0);
  console.log(`${label.padEnd(44)} ${String(Math.round(performance.now() - start)).padStart(6)} ms   (${rows} dòng)`);
  return result;
}

async function main() {
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "GROUP_ADMIN" }, select: { id: true, role: true, companyId: true } });
  await prisma.$queryRaw`SELECT 1`; // mở sẵn kết nối (không tính thời gian kết nối)

  try {
    await prisma.$transaction(
      async (tx) => {
        const { companyId, courseIds } = await seed(tx);
        for (const label of ["Lần 1", "Lần 2"]) {
          console.log(`\n--- ${label} ---`);
          const ctx = await timed("Ngữ cảnh (phạm vi + người + phòng ban)", () =>
            resolveReportContext(admin, parseReportFilters({ company: companyId }), tx),
          );
          await timed("Tab Theo khoá học", () => courseReport(ctx, tx));
          await timed("  Chi tiết 1 khoá (danh sách người)", () => courseLearners(ctx, courseIds[0], "all", tx));
          await timed("Tab Theo phòng ban (cộng dồn)", () => departmentReport(ctx, true, tx));
          await timed("Tab Theo người", () => memberReport(ctx, tx));
          await timed("Tab Nắm quy trình mới nhất", () => versionReport(ctx, tx));
          await timed("Tab Chứng nhận — 90 ngày", () => certificateReport(ctx, "90", tx));
          await timed("Tab Chứng nhận — đã hết hạn", () => certificateReport(ctx, "expired", tx));
          // Dashboard tập đoàn: các truy vấn trang /system/overview chạy song song như ở trang
          const now = new Date();
          await timed("Dashboard tập đoàn (toàn bộ truy vấn trang)", async () => {
            const [stats] = await Promise.all([
              getCompanyStats(now, tx),
              getMonthlyCompletions(null, now, tx),
              getAttentionCourses(now, tx),
              tx.auditLog.findMany({ where: { actorId: { not: null } }, orderBy: { createdAt: "desc" }, take: 10 }),
            ]);
            return stats.companies;
          });
          await timed("  Xu hướng 1 công ty", () => getMonthlyCompletions(companyId, now, tx));
        }
        throw new Rollback();
      },
      { timeout: 600_000, maxWait: 10_000 },
    );
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
    console.log("\nĐã rollback — không để lại dữ liệu tạm.");
  }
}

main().finally(() => prisma.$disconnect());
