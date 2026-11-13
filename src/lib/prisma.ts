import { PrismaClient } from "@prisma/client";

/**
 * Dùng chung MỘT kết nối Prisma cho toàn app.
 * Khi chạy dev, Next.js nạp lại code liên tục; nếu mỗi lần tạo PrismaClient mới
 * sẽ mở quá nhiều kết nối tới PostgreSQL. Lưu vào globalThis để tái sử dụng.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
