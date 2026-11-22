import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Một kết nối Prisma dùng chung cho toàn app.
 *
 * Khi chạy `npm run dev`, Next.js nạp lại code mỗi lần bạn lưu file. Nếu mỗi lần
 * nạp lại lại tạo PrismaClient mới thì số kết nối tới Postgres tăng dần đến khi
 * báo lỗi "too many connections". Lưu client vào globalThis để dùng lại.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
