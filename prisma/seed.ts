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
 *   - 15 nhân viên mẫu (NV002–NV009, CTYA-NV002–CTYA-NV008): đủ phòng ban, chức danh, vai trò,
 *     vài trưởng phòng và 2 người đã khoá
 *   - 2 khoá học mẫu DEMO-QT-01, DEMO-AT-01 giao cho NV004 (có tiến độ, 1 khoá quá hạn) và NV001
 *
 * Chạy lại nhiều lần vẫn an toàn: cái gì đã có thì giữ nguyên, không ghi đè.
 * Thông tin lấy từ các biến SEED_* trong .env
 */
import { Prisma, PrismaClient, type Role } from "@prisma/client";
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

  // 8. Nhân viên mẫu (Việc 6A) — rải đủ phòng ban, chức danh, vai trò để thử trang Người dùng
  await seedSampleEmployees({
    adminPassword,
    companies: { TONG: company.id, CTYA: subsidiary.id },
    departments: { TONG: groupDepartments, CTYA: subsidiaryDepartments },
  });

  // 9. Khoá học + tiến độ mẫu (Việc 14) — để thấy “Tiếp tục học”, ✓ / 🔒, quá hạn ở cổng học viên
  await seedDemoLearning({ companyId: company.id, adminCode });
  await seedSampleNotifications("NV001");
}

/** Hạn = 23:59:59 giờ VN của ngày (hôm nay + days). */
function vnDueAfterDays(days: number): Date {
  const vn = new Date(Date.now() + 7 * 3600_000);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + days, 23 - 7, 59, 59));
}

const DEMO_COURSES = [
  {
    code: "DEMO-QT-01",
    title: "Quy trình bán hàng chuẩn",
    category: "Quy trình",
    description:
      "Nắm các bước bán hàng chuẩn của tập đoàn: từ tiếp cận khách hàng, tư vấn, báo giá đến chăm sóc sau bán.\nKhoá học gồm 5 bài đọc ngắn, học lần lượt từng bài.",
    sections: [
      { title: "Tổng quan quy trình", lessons: ["Giới thiệu quy trình bán hàng", "Các bước tiếp cận khách hàng"] },
      { title: "Thực hành", lessons: ["Báo giá và chốt đơn", "Chăm sóc sau bán", "Tổng kết khoá học"] },
    ],
  },
  {
    code: "DEMO-AT-01",
    title: "An toàn lao động cơ bản",
    category: "An toàn",
    description: "Các quy định an toàn tối thiểu tại văn phòng và kho hàng.",
    sections: [{ title: "Nội dung", lessons: ["Nhận diện mối nguy", "Xử lý khi có sự cố"] }],
  },
];

/** Tạo khoá mẫu + giao cho NV004 / NV001 (chỉ khi khoá mẫu chưa có — chạy lại không trùng). */
async function seedDemoLearning(args: { companyId: string; adminCode: string }) {
  if (await prisma.course.findUnique({ where: { code: DEMO_COURSES[0].code }, select: { id: true } })) {
    console.log("• Khoá học mẫu đã có — giữ nguyên");
    return;
  }
  const [admin, nv004, nv001] = await Promise.all(
    [args.adminCode, "NV004", "NV001"].map((employeeCode) =>
      prisma.user.findUnique({ where: { employeeCode }, select: { id: true } }),
    ),
  );
  if (!admin || !nv004 || !nv001) {
    console.log("• Thiếu tài khoản mẫu (ADMIN / NV004 / NV001) — bỏ qua khoá học mẫu");
    return;
  }
  const categories = new Map(
    (await prisma.courseCategory.findMany({ select: { id: true, name: true } })).map((c) => [c.name, c.id]),
  );
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const lessonIds: Record<string, string[]> = {};
    const courseIds: Record<string, string> = {};
    for (const c of DEMO_COURSES) {
      const course = await tx.course.create({
        data: {
          ownerCompanyId: args.companyId,
          categoryId: categories.get(c.category) ?? null,
          code: c.code,
          title: c.title,
          description: c.description,
          status: "PUBLISHED",
          currentVersion: 1,
          versions: {
            create: { versionNo: 1, changeType: "INITIAL", status: "PUBLISHED", publishedById: admin.id, publishedAt: now },
          },
        },
        select: { id: true },
      });
      courseIds[c.code] = course.id;
      lessonIds[c.code] = [];
      for (const [si, s] of c.sections.entries()) {
        const section = await tx.courseSection.create({
          data: { courseId: course.id, title: s.title, sortOrder: si },
          select: { id: true },
        });
        for (const [li, title] of s.lessons.entries()) {
          const lesson = await tx.lesson.create({
            data: {
              sectionId: section.id,
              title,
              type: "DOCUMENT",
              sortOrder: li,
              content: `<h2>${title}</h2><p>Nội dung mẫu của bài “${title}”. Đọc kỹ và bấm hoàn thành để mở bài tiếp theo.</p>`,
            },
            select: { id: true },
          });
          lessonIds[c.code].push(lesson.id);
        }
      }
    }

    const [qt, at] = ["DEMO-QT-01", "DEMO-AT-01"];
    // NV004: khoá 1 đang học (bài 1 xong, bài 2 học dở) — còn 2 ngày (cam); khoá 2 chưa học, đã quá hạn 3 ngày (đỏ)
    await tx.enrollment.createMany({
      data: [
        {
          userId: nv004.id,
          courseId: courseIds[qt],
          source: "ASSIGNED",
          assignedById: admin.id,
          status: "IN_PROGRESS",
          progressPercent: 20,
          startedAt: now,
          dueDate: vnDueAfterDays(2),
        },
        {
          userId: nv004.id,
          courseId: courseIds[at],
          source: "ASSIGNED",
          assignedById: admin.id,
          dueDate: vnDueAfterDays(-3),
        },
        // NV001: được giao khoá 1, chưa học
        {
          userId: nv001.id,
          courseId: courseIds[qt],
          source: "ASSIGNED",
          assignedById: admin.id,
          dueDate: vnDueAfterDays(30),
        },
      ],
    });
    await tx.lessonProgress.createMany({
      data: [
        { userId: nv004.id, lessonId: lessonIds[qt][0], isCompleted: true, completedAt: now },
        { userId: nv004.id, lessonId: lessonIds[qt][1], isCompleted: false },
      ],
    });
  });
  console.log("✔ Khoá học mẫu: DEMO-QT-01 (5 bài), DEMO-AT-01 (2 bài) — giao cho NV004 (có tiến độ) và NV001");
}

type SampleEmployee = {
  employeeCode: string;
  fullName: string;
  company: "TONG" | "CTYA";
  department: string;
  position: string;
  role: Role;
  email: string;
  phone: string;
  hireDate: string;
  inactive?: boolean;
  /** Làm trưởng phòng này (chỉ gán khi phòng chưa có trưởng phòng) */
  manages?: string;
};

const SAMPLE_EMPLOYEES: SampleEmployee[] = [
  // --- Công ty tổng ---
  { employeeCode: "NV002", fullName: "Lê Hoàng Minh", company: "TONG", department: "KD", position: "TP", role: "MANAGER", email: "minh.le@tong.vn", phone: "0901 000 002", hireDate: "2018-03-01", manages: "KD" },
  { employeeCode: "NV003", fullName: "Phạm Thu Hà", company: "TONG", department: "KD-N2", position: "TP", role: "MANAGER", email: "ha.pham@tong.vn", phone: "0901 000 003", hireDate: "2019-07-15", manages: "KD-N2" },
  { employeeCode: "NV004", fullName: "Võ Đức Thắng", company: "TONG", department: "KD-N1-T1", position: "NVKD", role: "LEARNER", email: "thang.vo@tong.vn", phone: "0901 000 004", hireDate: "2022-02-10" },
  { employeeCode: "NV005", fullName: "Đặng Ngọc Lan", company: "TONG", department: "KT", position: "KT", role: "LEARNER", email: "lan.dang@tong.vn", phone: "0901 000 005", hireDate: "2021-09-01" },
  { employeeCode: "NV006", fullName: "Bùi Quang Huy", company: "TONG", department: "HCNS", position: "NVHC", role: "CONTENT_EDITOR", email: "huy.bui@tong.vn", phone: "0901 000 006", hireDate: "2020-05-20" },
  { employeeCode: "NV007", fullName: "Hoàng Mai Anh", company: "TONG", department: "HCNS", position: "TP", role: "MANAGER", email: "anh.hoang@tong.vn", phone: "0901 000 007", hireDate: "2017-11-01", manages: "HCNS" },
  { employeeCode: "NV008", fullName: "Đỗ Văn Khoa", company: "TONG", department: "KD-N1", position: "NVKD", role: "LEARNER", email: "khoa.do@tong.vn", phone: "0901 000 008", hireDate: "2021-01-04", inactive: true },
  { employeeCode: "NV009", fullName: "Ngô Thị Thanh", company: "TONG", department: "KT", position: "TP", role: "MANAGER", email: "thanh.ngo@tong.vn", phone: "0901 000 009", hireDate: "2016-06-01", manages: "KT" },
  // --- Công ty con CTYA ---
  { employeeCode: "CTYA-NV002", fullName: "Phan Văn Long", company: "CTYA", department: "KD", position: "TP", role: "MANAGER", email: "long.phan@ctya.vn", phone: "0902 000 002", hireDate: "2019-03-11", manages: "KD" },
  { employeeCode: "CTYA-NV003", fullName: "Trịnh Thị Hồng", company: "CTYA", department: "KD-MB", position: "NVKD", role: "LEARNER", email: "hong.trinh@ctya.vn", phone: "0902 000 003", hireDate: "2022-08-01" },
  { employeeCode: "CTYA-NV004", fullName: "Lý Minh Tuấn", company: "CTYA", department: "KD-MB-HN", position: "NVKD", role: "LEARNER", email: "tuan.ly@ctya.vn", phone: "0902 000 004", hireDate: "2023-04-17" },
  { employeeCode: "CTYA-NV005", fullName: "Huỳnh Bảo Ngọc", company: "CTYA", department: "KT", position: "KT", role: "CONTENT_EDITOR", email: "ngoc.huynh@ctya.vn", phone: "0902 000 005", hireDate: "2020-10-05" },
  { employeeCode: "CTYA-NV006", fullName: "Mai Xuân Phúc", company: "CTYA", department: "KT", position: "TP", role: "COMPANY_ADMIN", email: "phuc.mai@ctya.vn", phone: "0902 000 006", hireDate: "2018-12-03", manages: "KT" },
  { employeeCode: "CTYA-NV007", fullName: "Đinh Thị Yến", company: "CTYA", department: "KD-MB-HN", position: "NVKD", role: "LEARNER", email: "yen.dinh@ctya.vn", phone: "0902 000 007", hireDate: "2022-01-10", inactive: true },
  { employeeCode: "CTYA-NV008", fullName: "Tạ Quốc Bảo", company: "CTYA", department: "KD-MB", position: "TP", role: "MANAGER", email: "bao.ta@ctya.vn", phone: "0902 000 008", hireDate: "2019-09-23", manages: "KD-MB" },
];

/** Upsert theo mã nhân viên (đã có thì giữ nguyên, không ghi đè). Gán trưởng phòng chỉ khi phòng chưa có. */
async function seedSampleEmployees(args: {
  adminPassword: string;
  companies: Record<SampleEmployee["company"], string>;
  departments: Record<SampleEmployee["company"], Map<string, string>>;
}) {
  const positions = new Map(
    (await prisma.position.findMany({ select: { id: true, code: true } })).map((p) => [p.code, p.id]),
  );
  // Cùng 1 mật khẩu cho mọi tài khoản mẫu -> băm 1 lần
  const passwordHash = await bcrypt.hash(args.adminPassword, 12);

  let created = 0;
  let managers = 0;
  for (const e of SAMPLE_EMPLOYEES) {
    const companyId = args.companies[e.company];
    const departmentId = args.departments[e.company].get(e.department) ?? null;
    const before = await prisma.user.findUnique({ where: { employeeCode: e.employeeCode }, select: { id: true } });

    const user = await prisma.user.upsert({
      where: { employeeCode: e.employeeCode },
      update: {},
      create: {
        employeeCode: e.employeeCode,
        fullName: e.fullName,
        email: e.email,
        phone: e.phone,
        hireDate: new Date(`${e.hireDate}T00:00:00.000Z`),
        role: e.role,
        status: e.inactive ? "INACTIVE" : "ACTIVE",
        companyId,
        departmentId,
        positionId: positions.get(e.position) ?? null,
        passwordHash,
        mustChangePassword: true,
      },
      select: { id: true, companyId: true, status: true },
    });
    if (!before) created++;

    // Trưởng phòng mẫu: người phải còn ở đúng công ty, đang làm; phòng chưa có trưởng phòng
    const managedId = e.manages ? args.departments[e.company].get(e.manages) : undefined;
    if (managedId && user.companyId === companyId && user.status === "ACTIVE") {
      const result = await prisma.department.updateMany({
        where: { id: managedId, managerId: null },
        data: { managerId: user.id },
      });
      managers += result.count;
    }
  }
  console.log(
    `✔ Nhân viên mẫu: ${SAMPLE_EMPLOYEES.length} (mới tạo ${created}, gán thêm ${managers} trưởng phòng) — mật khẩu = SEED_ADMIN_PASSWORD`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("✘ Seed lỗi:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

/**
 * Thông báo mẫu đủ các loại cho 1 học viên (Việc 19). dedupeKey "SEED:<LOẠI>" + skipDuplicates → chạy lại không trùng.
 * Thời gian lùi dần để thấy "vừa xong / phút trước / hôm qua / dd/MM/yyyy"; vài thông báo đã đọc.
 */
async function seedSampleNotifications(employeeCode: string) {
  const user = await prisma.user.findUnique({ where: { employeeCode }, select: { id: true } });
  if (!user) {
    console.log(`• Không có tài khoản ${employeeCode} — bỏ qua thông báo mẫu`);
    return;
  }
  const course = await prisma.course.findFirst({
    where: { enrollments: { some: { userId: user.id } } },
    select: { id: true, title: true },
  });
  const courseLink = course ? `/my-courses/${course.id}` : "/my-courses";
  const courseTitle = course?.title ?? "Quy trình bán hàng";
  const now = Date.now();
  const minutes = (m: number) => new Date(now - m * 60_000);

  const samples: { type: string; title: string; link: string | null; at: Date; read: boolean }[] = [
    { type: "COURSE_ASSIGNED", title: `Bạn được giao khoá học “${courseTitle}”`, link: "/my-courses", at: minutes(0.2), read: false },
    { type: "DUE_SOON", title: `Khoá học “${courseTitle}” sẽ đến hạn sau 3 ngày`, link: courseLink, at: minutes(5), read: false },
    { type: "QUIZ_ATTEMPTS_GRANTED", title: "Bạn được cấp thêm 1 lượt làm bài kiểm tra", link: courseLink, at: minutes(90), read: false },
    { type: "OVERDUE", title: `Khoá học “${courseTitle}” đã quá hạn hoàn thành`, link: courseLink, at: minutes(60 * 26), read: false },
    { type: "VERSION_MAJOR", title: `Quy trình “${courseTitle}” thay đổi lớn — bạn cần học lại`, link: courseLink, at: minutes(60 * 24 * 3), read: false },
    { type: "VERSION_MINOR", title: `Quy trình “${courseTitle}” có cập nhật nhỏ — hãy đọc và xác nhận`, link: courseLink, at: minutes(60 * 24 * 5), read: true },
    { type: "CERTIFICATE_ISSUED", title: "Chúc mừng! Bạn đã nhận chứng nhận hoàn thành khoá học", link: "/certificates", at: minutes(60 * 24 * 10), read: true },
    { type: "CERTIFICATE_EXPIRING", title: "Chứng nhận của bạn sẽ hết hạn sau 30 ngày", link: "/certificates", at: minutes(60 * 24 * 12), read: false },
    { type: "REMINDER", title: "Trưởng phòng nhắc bạn hoàn thành các khoá học được giao", link: "/my-courses", at: minutes(60 * 24 * 20), read: true },
  ];

  const result = await prisma.notification.createMany({
    data: samples.map((n) => ({
      userId: user.id,
      type: n.type,
      title: n.title,
      link: n.link,
      createdAt: n.at,
      readAt: n.read ? n.at : null,
      dedupeKey: `SEED:${n.type}`,
    })),
    skipDuplicates: true,
  });
  console.log(result.count > 0 ? `✔ Thông báo mẫu: ${result.count} thông báo cho ${employeeCode}` : `• Thông báo mẫu của ${employeeCode} đã có — giữ nguyên`);
}
