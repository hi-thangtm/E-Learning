/**
 * Dữ liệu mẫu CỐ ĐỊNH cho bộ kiểm thử e2e (Việc 31):   npm run test:seed
 * 1) Tạo database elearning_test nếu chưa có  2) prisma migrate deploy  3) XOÁ SẠCH  4) seed lại.
 * Chỉ chạy với DATABASE_URL của .env.test (tên database phải là elearning_test).
 *
 * Tài khoản (mật khẩu chung Test12345):
 *   TEST-GA (Admin tập đoàn) · TEST-CA1 (Admin CTY1) · TEST-CA2 (Admin CTY2) · TEST-CE1 (Biên soạn CTY1)
 *   TEST-MG1 (trưởng phòng KD của CTY1, có phòng con KD-N1) · TEST-LN1…LN5 (học viên trong đội MG1)
 *   TEST-OUT (CTY1, phòng KT — ngoài đội) · TEST-CTY2-LN (học viên CTY2)
 *   TEST-NEW (bắt đổi mật khẩu lần đầu) · TEST-LOCK / TEST-RESET (phiên bị huỷ) · TEST-RATE (giới hạn đăng nhập) · TEST-SEC* (phân quyền)
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { withDatabase } from "./perf/common";
import { assertTestDatabase, readTestEnv, TEST_DB_NAME, TEST_PASSWORD } from "./test/common";

const env = readTestEnv();
const url = assertTestDatabase(env.DATABASE_URL);

async function ensureDatabase() {
  const admin = new PrismaClient({ datasourceUrl: withDatabase(url, "postgres") });
  try {
    const rows = await admin.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM pg_database WHERE datname = ${TEST_DB_NAME}`;
    if (rows[0].n === 0) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${TEST_DB_NAME}"`);
      console.log(`✔ Đã tạo database ${TEST_DB_NAME}`);
    }
  } finally {
    await admin.$disconnect();
  }
}

export async function seedTest(db: PrismaClient) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);

  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);

  const tong = await db.company.create({ data: { code: "TONG", name: "Tập đoàn Thử" } });
  const cty1 = await db.company.create({ data: { code: "CTY1", name: "Công ty Thử 1", parentId: tong.id } });
  const cty2 = await db.company.create({ data: { code: "CTY2", name: "Công ty Thử 2", parentId: tong.id } });

  const [nvkd, tp] = await Promise.all([
    db.position.create({ data: { code: "NVKD", name: "Nhân viên kinh doanh" } }),
    db.position.create({ data: { code: "TP", name: "Trưởng phòng" } }),
    db.position.create({ data: { code: "KT", name: "Kế toán" } }),
  ]);
  const [catQT] = await Promise.all([
    db.courseCategory.create({ data: { name: "Quy trình", sortOrder: 0 } }),
    db.courseCategory.create({ data: { name: "An toàn", sortOrder: 1 } }),
  ]);

  const kd = await db.department.create({ data: { companyId: cty1.id, code: "KD", name: "Phòng Kinh doanh" } });
  const kdN1 = await db.department.create({ data: { companyId: cty1.id, code: "KD-N1", name: "Nhóm Kinh doanh 1", parentId: kd.id } });
  const kt = await db.department.create({ data: { companyId: cty1.id, code: "KT", name: "Phòng Kế toán" } });
  const kd2 = await db.department.create({ data: { companyId: cty2.id, code: "KD", name: "Phòng Kinh doanh CTY2" } });
  await db.department.create({ data: { companyId: tong.id, code: "HC", name: "Phòng Hành chính" } });

  const user = (employeeCode: string, fullName: string, data: { role?: "GROUP_ADMIN" | "COMPANY_ADMIN" | "CONTENT_EDITOR" | "MANAGER" | "LEARNER"; companyId: string; departmentId?: string | null; mustChangePassword?: boolean }) =>
    db.user.create({
      data: {
        employeeCode,
        fullName,
        email: `${employeeCode.toLowerCase()}@test.vn`,
        passwordHash,
        mustChangePassword: data.mustChangePassword ?? false,
        role: data.role ?? "LEARNER",
        companyId: data.companyId,
        departmentId: data.departmentId ?? null,
        positionId: data.role === "MANAGER" ? tp.id : nvkd.id,
      },
    });

  await user("TEST-GA", "Quản trị Tập đoàn Thử", { role: "GROUP_ADMIN", companyId: tong.id });
  await user("TEST-CA1", "Quản trị Công ty Thử 1", { role: "COMPANY_ADMIN", companyId: cty1.id });
  await user("TEST-CA2", "Quản trị Công ty Thử 2", { role: "COMPANY_ADMIN", companyId: cty2.id });
  await user("TEST-CE1", "Biên soạn Thử 1", { role: "CONTENT_EDITOR", companyId: cty1.id, departmentId: kt.id });
  const mg1 = await user("TEST-MG1", "Trưởng phòng Thử", { role: "MANAGER", companyId: cty1.id, departmentId: kd.id });
  await db.department.update({ where: { id: kd.id }, data: { managerId: mg1.id } });
  await user("TEST-LN1", "Học viên Thử Một", { companyId: cty1.id, departmentId: kd.id });
  await user("TEST-LN2", "Học viên Thử Hai", { companyId: cty1.id, departmentId: kd.id });
  await user("TEST-LN3", "Học viên Thử Ba", { companyId: cty1.id, departmentId: kdN1.id });
  await user("TEST-LN4", "Học viên Thử Bốn", { companyId: cty1.id, departmentId: kdN1.id });
  await user("TEST-LN5", "Học viên Thử Năm", { companyId: cty1.id, departmentId: kd.id });
  await user("TEST-OUT", "Nhân viên Ngoài Đội", { companyId: cty1.id, departmentId: kt.id });
  await user("TEST-CTY2-LN", "Học viên Công ty 2", { companyId: cty2.id, departmentId: kd2.id });
  await user("TEST-NEW", "Nhân viên Mới Vào", { companyId: cty1.id, departmentId: kt.id, mustChangePassword: true });
  await user("TEST-LOCK", "Người Bị Khoá", { companyId: cty1.id, departmentId: kt.id });
  await user("TEST-RESET", "Người Đặt Lại Mật Khẩu", { companyId: cty1.id, departmentId: kt.id });
  await user("TEST-RATE", "Người Thử Giới Hạn", { companyId: cty1.id, departmentId: kt.id });
  for (const code of ["TEST-SEC-LN", "TEST-SEC-MG", "TEST-SEC-CE", "TEST-SEC-CA"]) {
    const role = code.endsWith("LN") ? "LEARNER" : code.endsWith("MG") ? "MANAGER" : code.endsWith("CE") ? "CONTENT_EDITOR" : "COMPANY_ADMIN";
    await user(code, `Phân quyền ${role}`, { role, companyId: cty1.id, departmentId: kt.id });
  }

  // Khoá có sẵn cho thư viện + lộ trình (các kịch bản khác tự tạo khoá riêng qua e2e/helpers/db.ts)
  const docCourse = async (code: string, title: string, opts: { allowSelfEnroll?: boolean } = {}) => {
    const c = await db.course.create({
      data: {
        ownerCompanyId: cty1.id,
        categoryId: catQT.id,
        code,
        title,
        status: "PUBLISHED",
        currentVersion: 1,
        allowSelfEnroll: opts.allowSelfEnroll ?? false,
        versions: { create: { versionNo: 1, changeType: "INITIAL", status: "PUBLISHED", publishedAt: new Date() } },
        sections: { create: { title: "Chương 1", lessons: { create: { title: `Bài đọc ${code}`, type: "DOCUMENT", content: `<p>Nội dung ${code}</p>` } } } },
      },
    });
    return c;
  };
  await docCourse("TEST-TU-DANG-KY", "Khoá tự đăng ký thử", { allowSelfEnroll: true });
  const lt1 = await docCourse("TEST-LT-1", "Lộ trình — khoá 1");
  const lt2 = await docCourse("TEST-LT-2", "Lộ trình — khoá 2");
  await db.learningPath.create({
    data: {
      ownerCompanyId: cty1.id,
      code: "TEST-LT",
      title: "Lộ trình thử",
      status: "PUBLISHED",
      courses: { create: [{ courseId: lt1.id, sortOrder: 0 }, { courseId: lt2.id, sortOrder: 1 }] },
    },
  });
}

async function main() {
  const t = Date.now();
  await ensureDatabase();
  execSync("npx prisma migrate deploy", { stdio: "pipe", env: { ...process.env, DATABASE_URL: url } });
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await seedTest(db);
  } finally {
    await db.$disconnect();
  }
  console.log(`✔ Đã seed ${TEST_DB_NAME} (${((Date.now() - t) / 1000).toFixed(1)} giây).`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error("✘", e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
