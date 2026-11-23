import "server-only";
import { PrismaClient } from "@prisma/client";

/**
 * Một kết nối Prisma dùng chung cho toàn app.
 *
 * Khi chạy `npm run dev`, Next.js nạp lại code mỗi lần bạn lưu file. Nếu mỗi lần
 * nạp lại lại tạo PrismaClient mới thì số kết nối tới Postgres tăng dần đến khi
 * báo lỗi "too many connections". Lưu client vào globalThis để dùng lại.
 *
 * Đo hiệu năng (Việc 30): PERF_LOG_QUERIES=true → đếm số truy vấn Prisma (đọc + đặt lại qua GET /api/perf/queries).
 * Mặc định TẮT: không đăng ký sự kiện, không tốn gì khi chạy thật.
 */
const PERF_LOG_QUERIES = process.env.PERF_LOG_QUERIES === "true";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; perfQueryCount?: number };

function createClient(): PrismaClient {
  const level = process.env.NODE_ENV === "development" ? (["warn", "error"] as const) : (["error"] as const);
  if (!PERF_LOG_QUERIES) return new PrismaClient({ log: [...level] });
  const client = new PrismaClient({ log: [{ emit: "event", level: "query" }, ...level.map((l) => ({ emit: "stdout" as const, level: l }))] });
  client.$on("query", () => {
    globalForPrisma.perfQueryCount = (globalForPrisma.perfQueryCount ?? 0) + 1;
  });
  return client as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/** Số truy vấn từ lần đọc trước (rồi đặt lại về 0). null = đang tắt đếm. */
export function takePerfQueryCount(): number | null {
  if (!PERF_LOG_QUERIES) return null;
  const n = globalForPrisma.perfQueryCount ?? 0;
  globalForPrisma.perfQueryCount = 0;
  return n;
}
