import "server-only";
import { courseVisibleWhere, getGroupCompanyId } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";

const COURSE_PREFIX = "courses/";
const COMPANY_PREFIX = "companies/";
const EDITOR_ROLES = new Set(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);

type Access = "ok" | "forbidden" | "missing";

/**
 * Ai được xem file đã lưu (route /api/files/[...key]):
 * - File thuộc khoá học (`courses/...`: ảnh bìa, PDF bài học, ảnh câu hỏi) → người có lượt học khoá đó (khác CANCELLED),
 *   hoặc người soạn / quản trị thấy được khoá đó theo phạm vi (Quy tắc 1, courseVisibleWhere).
 *   File không gắn với khoá nào → "missing" (404).
 * - File của công ty (`companies/<id>/...`: logo / chữ ký mẫu chứng nhận) → xem `canReadCompanyFile` (Việc 29B #9).
 * - File khác (VD logo hệ thống `branding/`) → chỉ cần đăng nhập.
 */
export async function canReadFile(user: CurrentUser, key: string): Promise<Access> {
  if (key.startsWith(COMPANY_PREFIX)) return canReadCompanyFile(user, key);
  if (!key.startsWith(COURSE_PREFIX)) return "ok";

  const course = await prisma.course.findFirst({
    where: {
      OR: [
        { thumbnailUrl: key },
        { sections: { some: { lessons: { some: { fileUrl: key } } } } },
        // Ảnh câu hỏi (courses/<courseId>/questions/...) — cùng quy tắc file khoá học
        { questions: { some: { imageUrl: key } } },
      ],
    },
    select: { id: true },
  });
  if (!course) return "missing";

  const enrolled = await prisma.enrollment.findFirst({
    where: { userId: user.id, courseId: course.id, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (enrolled) return "ok";

  if (EDITOR_ROLES.has(user.role)) {
    const scope = await courseVisibleWhere(user);
    const visible = await prisma.course.findFirst({ where: { AND: [{ id: course.id }, scope] }, select: { id: true } });
    if (visible) return "ok";
  }
  return "forbidden";
}

/**
 * `companies/<companyId>/...` — được xem khi:
 * - người xem thuộc công ty <companyId>, hoặc là GROUP_ADMIN;
 * - file là của CÔNG TY TỔNG và người xem là COMPANY_ADMIN công ty con: mẫu chứng nhận công ty tổng là mẫu mặc định
 *   hiện ở trang /system/certificate-templates của công ty con (logo / chữ ký "đang dùng của công ty tổng");
 * - người xem có chứng nhận (của chính mình) đang dùng file đó (templateSnapshot.logoKey / signatureKey).
 */
async function canReadCompanyFile(user: CurrentUser, key: string): Promise<Access> {
  const companyId = key.slice(COMPANY_PREFIX.length).split("/")[0];
  if (!companyId) return "missing";
  if (user.role === "GROUP_ADMIN" || user.companyId === companyId) return "ok";
  if (user.role === "COMPANY_ADMIN" && companyId === (await getGroupCompanyId())) return "ok";

  const ownCertificate = await prisma.certificate.findFirst({
    where: {
      userId: user.id,
      OR: [
        { templateSnapshot: { path: ["logoKey"], equals: key } },
        { templateSnapshot: { path: ["signatureKey"], equals: key } },
      ],
    },
    select: { id: true },
  });
  return ownCertificate ? "ok" : "forbidden";
}
