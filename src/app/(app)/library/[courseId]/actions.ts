"use server";

import { revalidatePath } from "next/cache";
import { assignCourse } from "@/lib/assignment";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { findLibraryCourse } from "@/lib/library";

/**
 * Tự đăng ký học (Việc 24): kiểm tra lại toàn bộ điều kiện thư viện ở server (không tin id từ trình duyệt)
 * → assignCourse source SELF, KHÔNG có hạn, assignedById = chính mình. Không thông báo, không ghi audit.
 * Trả `href` để trình duyệt chuyển trang (không redirect trong action vì hộp xác nhận bắt lỗi).
 */
export async function enrollAction(courseId: string): Promise<{ ok: boolean; message?: string; href?: string }> {
  const user = await requireUser();
  const course = await findLibraryCourse(user, String(courseId ?? ""), { id: true, title: true });
  if (!course) return { ok: false, message: "Khoá học không tồn tại hoặc không cho phép tự đăng ký." };
  const href = `/my-courses/${course.id}`;

  const existing = await prisma.enrollment.findFirst({
    where: { userId: user.id, courseId: course.id, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (existing) return { ok: true, message: "Bạn đã có khoá học này.", href };

  const counts = await assignCourse({
    courseId: course.id,
    userIds: [user.id],
    due: null,
    source: "SELF",
    assignedById: user.id,
    actorId: user.id,
  });
  if (counts.created + counts.reactivated === 0) {
    return { ok: false, message: "Không đăng ký được — tài khoản hoặc công ty của bạn đang bị khoá." };
  }

  revalidatePath("/library");
  revalidatePath("/my-courses");
  return { ok: true, message: `Đã đăng ký “${course.title}”. Chúc bạn học tốt!`, href };
}
