/**
 * Cấp bù chứng nhận:   npm run job:backfill-certificates
 * Mọi lượt học COMPLETED của khoá có cấp chứng nhận mà chưa có chứng nhận cho lần hoàn thành đó → cấp.
 * Chạy lại nhiều lần không cấp trùng (issueCertificate kiểm tra chứng nhận đã có).
 */
import { issueCertificate } from "@/lib/certificates";
import { prisma } from "@/lib/db";

const BATCH = 500;

async function main() {
  let cursor: string | undefined;
  let checked = 0;
  let issued = 0;
  for (;;) {
    const rows = await prisma.enrollment.findMany({
      where: { status: "COMPLETED", course: { hasCertificate: true } },
      select: { id: true },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });
    if (rows.length === 0) break;
    for (const e of rows) {
      checked++;
      const result = await prisma.$transaction((tx) => issueCertificate(tx, e.id));
      if (result?.created) issued++;
    }
    if (rows.length < BATCH) break;
    cursor = rows[rows.length - 1].id;
  }
  console.log(`✔ Đã kiểm tra ${checked} lượt học hoàn thành — cấp mới ${issued} chứng nhận.`);
}

main()
  .catch((error) => {
    console.error("✘ Cấp bù lỗi:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
