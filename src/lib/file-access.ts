import "server-only";
import type { CurrentUser } from "@/lib/current-user";
import { courseVisibleWhere } from "@/lib/course-scope";
import { prisma } from "@/lib/db";

const COURSE_PREFIX = "courses/";
const EDITOR_ROLES = new Set(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);

/**
 * Ai được xem file đã lưu (route /api/files/[...key]):
 * - File thuộc khoá học (`courses/...`: ảnh bìa, PDF bài học, ảnh câu hỏi) →người có lượt học khoá đó (khác CANCELLED),
 *   hoặc người soạn / quản trị thấy được khoá đó theo phạm vi (Quy tắc 1, courseVisibleWhere).
 *   File không gắn với khoá nào → "missing" (404).
 * - File khác → chỉ cần đăng nhập (quy tắc cũ).
 */
export async function canReadFile(user: CurrentUser, key: string): Promise<"ok" | "forbidden" | "missing"> {
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
