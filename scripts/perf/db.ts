/**
 * Tạo / xoá database đo hiệu năng (Việc 30):
 *   npm run perf:db        → CREATE DATABASE elearning_perf (nếu chưa có) + prisma migrate deploy
 *   npm run perf:db:drop   → DROP DATABASE elearning_perf
 * Đọc DATABASE_URL từ .env.perf; chỉ chạy khi tên database là elearning_perf.
 */
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { PERF_DB_NAME, argOf, assertPerfDatabase, withDatabase } from "./common";

async function main() {
  const url = assertPerfDatabase();
  // Kết nối DB quản trị "postgres" trên cùng máy chủ để tạo / xoá database
  const admin = new PrismaClient({ datasourceUrl: withDatabase(url, "postgres") });
  try {
    const rows = await admin.$queryRaw<{ n: number }[]>`SELECT COUNT(*)::int AS n FROM pg_database WHERE datname = ${PERF_DB_NAME}`;
    const exists = rows[0].n > 0;

    if (argOf("drop") === "true") {
      if (!exists) return console.log(`• Database ${PERF_DB_NAME} không tồn tại.`);
      // Ngắt các kết nối còn mở (VD app perf đang chạy) rồi xoá
      await admin.$executeRawUnsafe(
        `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${PERF_DB_NAME}' AND pid <> pg_backend_pid()`,
      );
      await admin.$executeRawUnsafe(`DROP DATABASE "${PERF_DB_NAME}"`);
      return console.log(`✔ Đã xoá database ${PERF_DB_NAME}.`);
    }

    if (!exists) {
      await admin.$executeRawUnsafe(`CREATE DATABASE "${PERF_DB_NAME}"`);
      console.log(`✔ Đã tạo database ${PERF_DB_NAME}.`);
    } else {
      console.log(`• Database ${PERF_DB_NAME} đã có.`);
    }
  } finally {
    await admin.$disconnect();
  }

  console.log("→ prisma migrate deploy ...");
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
}

main().catch((e) => {
  console.error("✘", e);
  process.exit(1);
});
