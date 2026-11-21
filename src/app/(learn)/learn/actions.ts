"use server";

import { z } from "zod";
import { requireUser } from "@/lib/current-user";
import { completeDocumentLesson, type LessonActionResult } from "@/lib/learning";

const lessonIdSchema = z.string().min(1, "Thiếu bài học.").max(50, "Bài học không hợp lệ.");

/** “Đã đọc xong” bài tài liệu — kiểm tra quyền, loại bài và đã mở đủ 15 giây ở server. Không ghi audit_logs. */
export async function markDocumentRead(lessonId: string): Promise<LessonActionResult> {
  const user = await requireUser();
  const parsed = lessonIdSchema.safeParse(lessonId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Bài học không hợp lệ." };
  return completeDocumentLesson(user.id, parsed.data);
}
