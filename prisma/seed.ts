/**
 * Dữ liệu khởi tạo — chạy bằng:  npx prisma db seed
 *
 * Tạo (nếu chưa có):
 *   - Công ty tổng
 *   - Tài khoản Admin tập đoàn đầu tiên (bắt đổi mật khẩu ở lần đăng nhập đầu)
 *   - Danh mục khoá học mặc định
 *   - Cài đặt hệ thống mặc định
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
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error("✘ Seed lỗi:", error);
    await prisma.$disconnect();
    process.exit(1);
  });
