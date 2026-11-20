/**
 * Dữ liệu khởi tạo — chạy bằng:  npx prisma db seed
 *
 * Tạo (nếu chưa có):
 *   - Công ty tổng
 *   - Tài khoản Admin tập đoàn đầu tiên (bắt đổi mật khẩu ở lần đăng nhập đầu)
 *   - Danh mục khoá học mặc định
 *   - Cài đặt hệ thống mặc định
 *   - Dữ liệu mẫu: 5 chức danh, công ty con CTYA, tài khoản Admin công ty con CTYA-ADMIN,
 *     phòng ban 2–3 cấp cho TONG và CTYA, 2 học viên mẫu NV001 / CTYA-NV001
 *
 * Chạy lại nhiều lần vẫn an toàn: cái gì đã có thì giữ nguyên, không ghi đè.
 * Thông tin lấy từ các biến SEED_* trong .env
 */
import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = ["Văn hoá – Nội quy", "Quy trình", "Kỹ năng", "An toàn"];

const DEFAULT_SETTINGS: Record<string, Prisma.InputJsonValue> = {
  SYSTEM_NAME: "E-Learning",
  DEFAULT_DUE_DAYS: 30,
  DEFAULT_MIN_WATCH_PERCENT: 90,
};

const SAMPLE_POSITIONS = [
  { code: "GD", name: "Giám đốc" },
  { code: "TP", name: "Trưởng phòng" },
  { code: "NVKD", name: "Nhân viên kinh doanh" },
  { code: "KT", name: "Kế toán" },
  { code: "NVHC", name: "Nhân viên hành chính" },
];

// Phòng ban mẫu: liệt kê cha trước con. parent = mã phòng cha trong cùng công ty.
type SampleDepartment = { code: string; name: string; parent?: string };

const SAMPLE_DEPARTMENTS_GROUP: SampleDepartment[] = [
  { code: "KD", name: "Phòng Kinh doanh" },
  { code: "KD-N1", name: "Nhóm Kinh doanh 1", parent: "KD" },
  { code: "KD-N1-T1", name: "Tổ Bán lẻ", parent: "KD-N1" },
  { code: "KD-N2", name: "Nhóm Kinh doanh 2", parent: "KD" },
  { code: "KT", name: "Phòng Kế toán" },
  { code: "HCNS", name: "Phòng Hành chính – Nhân sự" },
];

const SAMPLE_DEPARTMENTS_SUBSIDIARY: SampleDepartment[] = [
  { code: "KD", name: "Phòng Kinh doanh" },
  { code: "KD-MB", name: "Nhóm Miền Bắc", parent: "KD" },
  { code: "KD-MB-HN", name: "Tổ Hà Nội", parent: "KD-MB" },
  { code: "KT", name: "Phòng Kế toán" },
];

/** Tạo phòng ban mẫu (upsert theo companyId + code, chạy lại không trùng). Trả về map mã -> id. */
async function seedDepartments(companyId: string, departments: SampleDepartment[]) {
  const idByCode = new Map<string, string>();
  for (const d of departments) {
    const parentId = d.parent ? idByCode.get(d.parent) ?? null : null;
    const department = await prisma.department.upsert({
      where: { companyId_code: { companyId, code: d.code } },
      update: {},
      create: { companyId, code: d.code, name: d.name, parentId },
    });
    idByCode.set(d.code, department.id);
  }
  return idByCode;
}

const SAMPLE_SUBSIDIARY = { code: "CTYA", name: "Công ty Thành viên A" };
const SAMPLE_COMPANY_ADMIN_CODE = "CTYA-ADMIN";

async function main() {
  const companyCode = (process.env.SEED_COMPANY_CODE ?? "TONG").trim().toUpperCase();
  const companyName = process.env.SEED_COMPANY_NAME ?? "Công ty Tổng";
  const adminCode = (process.env.SEED_ADMIN_CODE ?? "ADMIN").trim().toUpperCase();
  const adminName = process.env.SEED_ADMIN_NAME ?? "Quản trị tập đoàn";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;

  if (!adminPassword || adminPassword.length < 8) {
    throw new Error("Hãy đặt SEED_ADMIN_PASSWORD (tối thiểu 8 ký tự) trong file .env");
  }

  // 1. Công ty tổng (parentId = NULL)
  const company = await prisma.company.upsert({
    where: { code: companyCode },
    update: {},
    create: { code: companyCode, name: companyName },
  });
  console.log(`✔ Công ty tổng: ${company.code} — ${company.name}`);

  // 2. Admin tập đoàn
  const existingAdmin = await prisma.user.findUnique({ where: { employeeCode: adminCode } });
  if (existingAdmin) {
    console.log(`• Tài khoản ${adminCode} đã có — giữ nguyên`);
  } else {
    await prisma.user.create({
      data: {
        employeeCode: adminCode,
        fullName: adminName,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        mustChangePassword: true,
        role: "GROUP_ADMIN",
        companyId: company.id,
      },
    });
    console.log(`✔ Admin tập đoàn: ${adminCode} (bắt đổi mật khẩu khi đăng nhập lần đầu)`);
  }

  // 3. Danh mục khoá học
  for (const [index, name] of DEFAULT_CATEGORIES.entries()) {
    await prisma.courseCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: index },
    });
  }
  console.log(`✔ Danh mục khoá học: ${DEFAULT_CATEGORIES.join(", ")}`);

  // 4. Cài đặt hệ thống
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.systemSetting.upsert({
      where: { key },
      update: {},
      create: { key, value },
    });
  }
  console.log("✔ Cài đặt hệ thống mặc định");

  // 5. Dữ liệu mẫu để thử chức năng (chức danh, 1 công ty con, 1 Admin công ty con)
  for (const position of SAMPLE_POSITIONS) {
    await prisma.position.upsert({ where: { code: position.code }, update: {}, create: position });
  }
  console.log(`✔ Chức danh mẫu: ${SAMPLE_POSITIONS.map((p) => p.code).join(", ")}`);

  const director = await prisma.position.findUniqueOrThrow({ where: { code: "GD" } });
  const headOfDept = await prisma.position.findUniqueOrThrow({ where: { code: "TP" } });

  // Admin tập đoàn chưa có chức danh -> gán Giám đốc
  await prisma.user.updateMany({
    where: { employeeCode: adminCode, positionId: null },
    data: { positionId: director.id },
  });

  const subsidiary = await prisma.company.upsert({
    where: { code: SAMPLE_SUBSIDIARY.code },
    update: {},
    create: { ...SAMPLE_SUBSIDIARY, parentId: company.id },
  });
  console.log(`✔ Công ty con mẫu: ${subsidiary.code} — ${subsidiary.name}`);

  const existingCompanyAdmin = await prisma.user.findUnique({
    where: { employeeCode: SAMPLE_COMPANY_ADMIN_CODE },
  });
  if (existingCompanyAdmin) {
    console.log(`• Tài khoản ${SAMPLE_COMPANY_ADMIN_CODE} đã có — giữ nguyên`);
  } else {
    await prisma.user.create({
      data: {
        employeeCode: SAMPLE_COMPANY_ADMIN_CODE,
        fullName: "Quản trị Công ty A",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        mustChangePassword: true,
        role: "COMPANY_ADMIN",
        companyId: subsidiary.id,
        positionId: headOfDept.id,
      },
    });
    console.log(
      `✔ Admin công ty con: ${SAMPLE_COMPANY_ADMIN_CODE} (mật khẩu ban đầu = SEED_ADMIN_PASSWORD, bắt đổi khi đăng nhập)`,
    );
  }

  // 6. Phòng ban mẫu 2–3 cấp
  const groupDepartments = await seedDepartments(company.id, SAMPLE_DEPARTMENTS_GROUP);
  const subsidiaryDepartments = await seedDepartments(subsidiary.id, SAMPLE_DEPARTMENTS_SUBSIDIARY);
  console.log(
    `✔ Phòng ban mẫu: ${company.code} (${groupDepartments.size}), ${subsidiary.code} (${subsidiaryDepartments.size})`,
  );

  // 7. Học viên mẫu (vai trò LEARNER) — để thử chỉ định trưởng phòng (tự nâng lên MANAGER)
  const salesStaff = await prisma.position.findUniqueOrThrow({ where: { code: "NVKD" } });
  const sampleLearners = [
    {
      employeeCode: "NV001",
      fullName: "Nguyễn Văn An",
      companyId: company.id,
      departmentId: groupDepartments.get("KD-N1") ?? null,
    },
    {
      employeeCode: "CTYA-NV001",
      fullName: "Trần Thị Bình",
      companyId: subsidiary.id,
      departmentId: subsidiaryDepartments.get("KD") ?? null,
    },
  ];
  for (const learner of sampleLearners) {
    const exists = await prisma.user.findUnique({ where: { employeeCode: learner.employeeCode } });
    if (exists) {
      console.log(`• Tài khoản ${learner.employeeCode} đã có — giữ nguyên`);
      continue;
    }
    await prisma.user.create({
      data: {
        ...learner,
        passwordHash: await bcrypt.hash(adminPassword, 12),
        mustChangePassword: true,
        role: "LEARNER",
        positionId: salesStaff.id,
      },
    });
    console.log(`✔ Học viên mẫu: ${learner.employeeCode} — ${learner.fullName}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("✘ Seed lỗi:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
