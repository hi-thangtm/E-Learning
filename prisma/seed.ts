/**
 * Dữ liệu khởi tạo: công ty tổng + 1 phòng ban + tài khoản Quản trị đầu tiên.
 * Chạy:  npx prisma db seed
 * Chạy nhiều lần không bị trùng (upsert = có rồi thì bỏ qua, chưa có thì tạo).
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminCode = process.env.SEED_ADMIN_CODE ?? "ADMIN";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!adminPassword) throw new Error("Thiếu SEED_ADMIN_PASSWORD trong file .env");

  const hq = await prisma.company.upsert({
    where: { code: "TONG" },
    update: {},
    create: { code: "TONG", name: "Công ty tổng (sửa tên sau)" },
  });

  const dept = await prisma.department.upsert({
    where: { code: "TONG-CDS" },
    update: {},
    create: { code: "TONG-CDS", name: "Phòng Chuyển đổi số", companyId: hq.id },
  });

  const admin = await prisma.user.upsert({
    where: { employeeCode: adminCode },
    update: {},
    create: {
      employeeCode: adminCode,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      fullName: "Quản trị hệ thống",
      role: "ADMIN",
      companyId: hq.id,
      departmentId: dept.id,
    },
  });

  console.log(`✔ Seed xong. Tài khoản quản trị: ${admin.employeeCode}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
