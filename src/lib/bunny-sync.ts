import "server-only";
import type { VideoStatus } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import { bunnyStatusToVideoStatus, getBunnyVideo, isBunnyConfigured } from "@/lib/bunny";
import { prisma } from "@/lib/db";

/**
 * Đồng bộ trạng thái video Bunny của bài (Việc 31B). Gọi từ: dialog bài học (hỏi định kỳ), webhook Bunny,
 * tác vụ hằng ngày, mở trang soạn khoá / trang học (giới hạn 1 lần / phút / bài).
 * KHÔNG tin dữ liệu ngoài (webhook): luôn hỏi lại Bunny bằng API key.
 */

export type BunnySyncResult = { status: VideoStatus; progress: number; changed: boolean };

type LessonRef = { id: string; videoId: string };

/** Hỏi Bunny 1 lần; xong (READY / FAILED) → cập nhật bài nếu bài VẪN đang chờ đúng video này (cập nhật có điều kiện + nhật ký trong 1 transaction). */
export async function syncBunnyLesson(lesson: LessonRef, actorId: string | null = null): Promise<BunnySyncResult | null> {
  if (!(await isBunnyConfigured())) return null;
  let info: Awaited<ReturnType<typeof getBunnyVideo>>;
  try {
    info = await getBunnyVideo(lesson.videoId);
  } catch {
    return null; // Bunny lỗi / không gọi được → giữ nguyên, lần sau hỏi lại
  }
  const status = bunnyStatusToVideoStatus(info.status);
  if (status === "PROCESSING") return { status, progress: info.encodeProgress, changed: false };

  const durationSeconds = status === "READY" && info.length > 0 ? Math.round(info.length) : null;
  const changed = await prisma.$transaction(async (tx) => {
    const updated = await tx.lesson.updateMany({
      where: { id: lesson.id, videoProvider: "BUNNY", videoId: lesson.videoId, videoStatus: "PROCESSING" },
      data: { videoStatus: status, durationSeconds },
    });
    if (updated.count !== 1) return false;
    const full = await tx.lesson.findUniqueOrThrow({
      where: { id: lesson.id },
      select: { title: true, section: { select: { title: true, course: { select: { id: true, code: true, ownerCompanyId: true } } } } },
    });
    await logAudit(tx, {
      actorId,
      companyId: full.section.course.ownerCompanyId,
      action: "LESSON_VIDEO_SET",
      entityType: "Lesson",
      entityId: lesson.id,
      metadata: {
        courseId: full.section.course.id,
        courseCode: full.section.course.code,
        sectionTitle: full.section.title,
        lessonTitle: full.title,
        provider: "BUNNY",
        videoId: lesson.videoId,
        durationSeconds,
        status,
      },
    });
    return true;
  });
  return { status, progress: 100, changed };
}

// --- Giới hạn khi MỞ TRANG: tối đa 1 lần / phút / bài (bộ nhớ của tiến trình) ---

const THROTTLE_MS = 60_000;
const lastChecked = new Map<string, number>();

/** Đồng bộ các bài BUNNY đang xử lý trong danh sách, mỗi bài tối đa 1 lần / phút. Trả về true nếu có bài đổi trạng thái. */
export async function syncProcessingLessonsThrottled(lessons: { id: string; videoProvider: string | null; videoId: string | null; videoStatus: string | null }[]): Promise<boolean> {
  if (!(await isBunnyConfigured())) return false;
  const now = Date.now();
  if (lastChecked.size > 5_000) {
    for (const [id, t] of lastChecked) if (now - t > THROTTLE_MS) lastChecked.delete(id);
  }
  const due = lessons.filter(
    (l) => l.videoProvider === "BUNNY" && l.videoStatus === "PROCESSING" && l.videoId && now - (lastChecked.get(l.id) ?? 0) >= THROTTLE_MS,
  );
  for (const l of due) lastChecked.set(l.id, now);
  const results = await Promise.all(due.map((l) => syncBunnyLesson({ id: l.id, videoId: l.videoId! })));
  return results.some((r) => r?.changed);
}
