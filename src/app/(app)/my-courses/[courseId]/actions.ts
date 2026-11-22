"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { cancellableSelfEnrollment } from "@/lib/library";
import { upsertMyReview } from "@/lib/reviews";

/**
 * Huỷ tự đăng ký (Việc 24): chỉ lượt của chính mình, source SELF, chưa bắt đầu, chưa có tiến độ — kiểm tra lại ở server.
 * → CANCELLED (không xoá). Không ghi audit.
 */
export async function cancelSelfEnrollmentAction(courseId: string): Promise<ActionState> {
  const user = await requireUser();
  const enrollmentId = await cancellableSelfEnrollment(user.id, String(courseId ?? ""));
  if (!enrollmentId) return { message: "Không huỷ được: chỉ huỷ được khoá tự đăng ký khi chưa bắt đầu học." };

  const r = await prisma.enrollment.updateMany({
    where: { id: enrollmentId, userId: user.id, source: "SELF", status: "NOT_STARTED" },
    data: { status: "CANCELLED" },
  });
  if (r.count === 0) return { message: "Lượt học vừa thay đổi — tải lại trang rồi thử lại." };

  revalidatePath("/my-courses");
  revalidatePath("/library");
  return { ok: true, message: "Đã huỷ đăng ký khoá học." };
}

/** Gửi / sửa đánh giá của chính mình (Việc 25) — chỉ khi đã học xong khoá; kiểm tra lại ở server. Không audit, không thông báo. */
export async function saveMyReviewAction(courseId: string, rating: number, comment: string): Promise<ActionState> {
  const user = await requireUser();
  const r = await upsertMyReview(user.id, String(courseId ?? ""), { rating, comment });
  if (!r.ok) return { message: r.message };
  revalidatePath(`/my-courses/${courseId}`);
  revalidatePath(`/content/courses/${courseId}`);
  return { ok: true, message: "Cảm ơn bạn đã đánh giá!" };
}
