"use server";

import { revalidatePath } from "next/cache";
import type { VideoProvider, VideoStatus } from "@prisma/client";
import { logAudit } from "@/lib/audit";
import {
  bunnyEmbedUrl,
  bunnyTusEndpoint,
  createBunnyVideo,
  createUploadTicket,
  deleteBunnyVideo,
  isBunnyConfigured,
  isBunnyVideoId,
  tusSignature,
  verifyUploadTicket,
} from "@/lib/bunny";
import { syncBunnyLesson } from "@/lib/bunny-sync";
import { findLessonForEdit } from "@/lib/course-content";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { LIMITS, rateLimit } from "@/lib/rate-limit";
import { parseYoutubeId } from "@/lib/youtube";

/**
 * Video của bài VIDEO (docs/database.md — Quy tắc 4). KHÔNG lưu file video trên server:
 * - YouTube: chỉ lưu mã video (server tự tách từ link), thời lượng do trình phát xem trước đo được.
 * - Bunny: server tạo video + ký chữ ký TUS; trình duyệt tải thẳng lên Bunny; server hỏi trạng thái xử lý.
 * Thay / gỡ video: xoá video Bunny cũ (lỗi chỉ ghi log, không chặn).
 *
 * Bunny + security-review #8 (Việc 31B): video vừa tạo được giữ ở `pendingVideoId` của bài; vé tải lên chỉ được nhận
 * khi đúng id đó (hoàn tất / huỷ = cập nhật có điều kiện → vé dùng 1 lần). Tạo video: tối đa 20 lần / giờ / người.
 * Pending quá 24 giờ → tác vụ hằng ngày xoá trên Bunny.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"] as const;
const NO_ACCESS = "Không tìm thấy bài học hoặc bạn không có quyền sửa.";
const MAX_VIDEO_BYTES = 4 * 1024 * 1024 * 1024; // 4GB
const VIDEO_TYPES: Record<string, string[]> = {
  mp4: ["video/mp4"],
  mov: ["video/quicktime"],
  mkv: ["video/x-matroska", "video/matroska", ""],
  webm: ["video/webm"],
};

type Result<T = object> = ({ ok: true } & T) | { ok: false; message: string };

async function loadVideoLesson(lessonId: string) {
  const actor = await requireRole([...ROLES]);
  const lesson = await findLessonForEdit(actor, lessonId);
  if (!lesson || lesson.type !== "VIDEO") return { actor, lesson: null };
  const video = await prisma.lesson.findUnique({
    where: { id: lesson.id },
    select: { videoProvider: true, videoId: true, videoStatus: true, durationSeconds: true, pendingVideoId: true },
  });
  return { actor, lesson: { ...lesson, ...video! } };
}

type VideoLesson = NonNullable<Awaited<ReturnType<typeof loadVideoLesson>>["lesson"]>;

function auditBase(actorId: string, lesson: VideoLesson) {
  const course = lesson.section.course;
  return {
    actorId,
    companyId: course.ownerCompanyId,
    entityType: "Lesson" as const,
    entityId: lesson.id,
  };
}

function lessonMeta(lesson: VideoLesson) {
  const course = lesson.section.course;
  return { courseId: course.id, courseCode: course.code, sectionTitle: lesson.section.title, lessonTitle: lesson.title };
}

const previous = (lesson: VideoLesson) =>
  lesson.videoProvider ? { previousProvider: lesson.videoProvider, previousVideoId: lesson.videoId } : {};

function revalidate(lesson: VideoLesson) {
  revalidatePath(`/content/courses/${lesson.section.course.id}`);
}

/** Bỏ video Bunny đang tải dở của bài (khi chuyển sang YouTube / gỡ video): xoá cột pending rồi xoá trên Bunny. */
async function dropPendingVideo(lesson: VideoLesson) {
  if (!lesson.pendingVideoId) return;
  const cleared = await prisma.lesson.updateMany({
    where: { id: lesson.id, pendingVideoId: lesson.pendingVideoId },
    data: { pendingVideoId: null, pendingVideoCreatedAt: null },
  });
  if (cleared.count === 1) await deleteBunnyVideo(lesson.pendingVideoId);
}

// --- YouTube ------------------------------------------------------------------------------------

export async function setYoutubeVideoAction(lessonId: string, url: string, durationSeconds: number): Promise<Result> {
  const { actor, lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };

  // Không tin mã video trình duyệt gửi: server tự tách lại từ link
  const videoId = parseYoutubeId(String(url ?? ""));
  if (!videoId) return { ok: false, message: "Link YouTube không hợp lệ." };
  const duration = Math.round(Number(durationSeconds));
  if (!Number.isFinite(duration) || duration < 1 || duration > 86_400) {
    return { ok: false, message: "Không xác định được thời lượng video. Video phải để chế độ Không công khai và cho phép nhúng." };
  }

  await prisma.$transaction([
    prisma.lesson.update({
      where: { id: lesson.id },
      data: { videoProvider: "YOUTUBE", videoId, videoStatus: "READY", durationSeconds: duration },
    }),
    logAudit(prisma, {
      ...auditBase(actor.id, lesson),
      action: "LESSON_VIDEO_SET",
      metadata: { ...lessonMeta(lesson), provider: "YOUTUBE", videoId, durationSeconds: duration, ...previous(lesson) },
    }),
  ]);
  if (lesson.videoProvider === "BUNNY") await deleteBunnyVideo(lesson.videoId);
  await dropPendingVideo(lesson);

  revalidate(lesson);
  return { ok: true };
}

// --- Bunny: tải lên trực tiếp từ trình duyệt ------------------------------------------------------

export type BunnyUpload = {
  endpoint: string;
  libraryId: string;
  videoId: string;
  signature: string;
  expire: number;
  ticket: string;
  title: string;
};

export async function prepareBunnyUploadAction(
  lessonId: string,
  file: { name: string; size: number; type: string },
): Promise<Result<{ upload: BunnyUpload }>> {
  const { actor, lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };
  if (!(await isBunnyConfigured())) return { ok: false, message: "Chưa cấu hình Bunny Stream." };

  // Trình duyệt tải thẳng lên Bunny nên server chỉ kiểm tra được thông tin khai báo; Bunny sẽ báo lỗi nếu không phải video
  const ext = String(file?.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  const size = Number(file?.size);
  if (!VIDEO_TYPES[ext] || !VIDEO_TYPES[ext].includes(String(file?.type ?? ""))) {
    return { ok: false, message: "Chỉ nhận video MP4, MOV, WEBM hoặc MKV." };
  }
  if (!Number.isFinite(size) || size <= 0) return { ok: false, message: "File rỗng." };
  if (size > MAX_VIDEO_BYTES) return { ok: false, message: "Video tối đa 4GB." };
  // Mỗi lần gọi tạo 1 video trên Bunny → giới hạn để không tạo video rỗng hàng loạt
  if (!rateLimit(`bunny-prepare:${actor.id}`, LIMITS.bunnyPrepare).ok) {
    return { ok: false, message: "Bạn đã tạo quá 20 lượt tải video trong 1 giờ. Vui lòng thử lại sau." };
  }

  const course = lesson.section.course;
  const title = `${course.code} — ${lesson.title}`.slice(0, 200);
  let videoId: string;
  try {
    videoId = await createBunnyVideo(title);
  } catch (error) {
    console.error("[bunny] Tạo video lỗi:", error);
    return { ok: false, message: "Không tạo được video trên Bunny. Kiểm tra cấu hình hoặc thử lại sau." };
  }

  // Ghi video mới vào pending (thay pending cũ — tải lại / mở 2 tab), rồi xoá pending cũ trên Bunny
  const previousPending = lesson.pendingVideoId;
  await prisma.$transaction([
    prisma.lesson.update({ where: { id: lesson.id }, data: { pendingVideoId: videoId, pendingVideoCreatedAt: new Date() } }),
    logAudit(prisma, {
      ...auditBase(actor.id, lesson),
      action: "LESSON_VIDEO_UPLOAD_STARTED",
      metadata: { ...lessonMeta(lesson), provider: "BUNNY", videoId, fileName: String(file?.name ?? "").slice(0, 200), size },
    }),
  ]);
  if (previousPending && previousPending !== videoId) await deleteBunnyVideo(previousPending);

  const { libraryId, signature, expire } = await tusSignature(videoId);
  return {
    ok: true,
    upload: {
      endpoint: bunnyTusEndpoint(),
      libraryId,
      videoId,
      signature,
      expire,
      ticket: createUploadTicket(lesson.id, videoId, expire),
      title,
    },
  };
}

export async function completeBunnyUploadAction(lessonId: string, videoId: string, ticket: string): Promise<Result> {
  const { actor, lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };
  if (!isBunnyVideoId(String(videoId)) || !verifyUploadTicket(lesson.id, videoId, String(ticket))) {
    return { ok: false, message: "Phiên tải lên không hợp lệ hoặc đã hết hạn. Hãy tải lại." };
  }

  // Chỉ nhận đúng video đang chờ của bài, và chỉ 1 lần: cập nhật có điều kiện pendingVideoId = videoId
  const attached = await prisma.$transaction(async (tx) => {
    const updated = await tx.lesson.updateMany({
      where: { id: lesson.id, pendingVideoId: videoId },
      data: { videoProvider: "BUNNY", videoId, videoStatus: "PROCESSING", durationSeconds: null, pendingVideoId: null, pendingVideoCreatedAt: null },
    });
    if (updated.count !== 1) return false;
    await logAudit(tx, {
      ...auditBase(actor.id, lesson),
      action: "LESSON_VIDEO_SET",
      metadata: { ...lessonMeta(lesson), provider: "BUNNY", videoId, durationSeconds: null, status: "PROCESSING", ...previous(lesson) },
    });
    return true;
  });
  if (!attached) return { ok: false, message: "Phiên tải lên không còn hiệu lực (đã hoàn tất, đã huỷ hoặc đã có lượt tải mới). Hãy tải lại." };

  // Video cũ (nếu là Bunny và khác video mới) -> xoá trên Bunny
  if (lesson.videoProvider === "BUNNY" && lesson.videoId !== videoId) await deleteBunnyVideo(lesson.videoId);
  // Hỏi Bunny ngay 1 lần (file nhỏ có thể đã xử lý xong)
  await syncBunnyLesson({ id: lesson.id, videoId }, actor.id);

  revalidate(lesson);
  return { ok: true };
}

export async function cancelBunnyUploadAction(lessonId: string, videoId: string, ticket: string): Promise<Result> {
  const { lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };
  if (!isBunnyVideoId(String(videoId)) || !verifyUploadTicket(lesson.id, videoId, String(ticket))) {
    return { ok: false, message: "Phiên tải lên không hợp lệ." };
  }
  // Chỉ huỷ đúng video đang chờ (không bao giờ xoá video đã gắn vào bài)
  const cleared = await prisma.lesson.updateMany({
    where: { id: lesson.id, pendingVideoId: videoId },
    data: { pendingVideoId: null, pendingVideoCreatedAt: null },
  });
  if (cleared.count === 1) await deleteBunnyVideo(videoId);
  return { ok: true };
}

/** Hỏi Bunny trạng thái xử lý (trình duyệt gọi mỗi 10 giây khi bài đang PROCESSING). */
export async function checkBunnyStatusAction(
  lessonId: string,
): Promise<Result<{ status: VideoStatus; durationSeconds: number | null; progress: number }>> {
  const { actor, lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };
  if (lesson.videoProvider !== "BUNNY" || !lesson.videoId || lesson.videoStatus !== "PROCESSING") {
    return { ok: true, status: lesson.videoStatus ?? "FAILED", durationSeconds: lesson.durationSeconds, progress: 100 };
  }

  const result = await syncBunnyLesson({ id: lesson.id, videoId: lesson.videoId }, actor.id);
  // Bunny lỗi / không gọi được → giữ PROCESSING, lần sau hỏi lại
  if (!result) return { ok: true, status: "PROCESSING", durationSeconds: null, progress: 0 };
  if (result.status === "PROCESSING") return { ok: true, status: "PROCESSING", durationSeconds: null, progress: result.progress };

  const fresh = await prisma.lesson.findUnique({ where: { id: lesson.id }, select: { videoStatus: true, durationSeconds: true } });
  revalidate(lesson);
  return { ok: true, status: fresh?.videoStatus ?? result.status, durationSeconds: fresh?.durationSeconds ?? null, progress: 100 };
}

// --- Gỡ video / xem trước --------------------------------------------------------------------------

export async function removeVideoAction(lessonId: string): Promise<Result> {
  const { actor, lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };
  if (!lesson.videoProvider) return { ok: false, message: "Bài chưa có video." };

  await prisma.$transaction([
    prisma.lesson.update({
      where: { id: lesson.id },
      data: { videoProvider: null, videoId: null, videoStatus: null, durationSeconds: null },
    }),
    logAudit(prisma, {
      ...auditBase(actor.id, lesson),
      action: "LESSON_VIDEO_REMOVED",
      metadata: { ...lessonMeta(lesson), provider: lesson.videoProvider, videoId: lesson.videoId },
    }),
  ]);
  if (lesson.videoProvider === "BUNNY") await deleteBunnyVideo(lesson.videoId);
  await dropPendingVideo(lesson);

  revalidate(lesson);
  return { ok: true };
}

/**
 * Thông tin để phát video. Bunny: URL nhúng kèm token mới (6 giờ) — tạo lại mỗi lần mở bài.
 * Việc này dùng cho xem trước trong dialog; Việc 15 làm bản tương tự với quyền của học viên.
 */
export async function getVideoPlaybackAction(
  lessonId: string,
): Promise<Result<{ provider: VideoProvider; videoId: string; embedUrl: string | null }>> {
  const { lesson } = await loadVideoLesson(lessonId);
  if (!lesson) return { ok: false, message: NO_ACCESS };
  if (!lesson.videoProvider || !lesson.videoId || lesson.videoStatus !== "READY") {
    return { ok: false, message: "Video chưa sẵn sàng." };
  }
  if (lesson.videoProvider === "BUNNY") {
    if (!(await isBunnyConfigured())) return { ok: false, message: "Chưa cấu hình Bunny Stream." };
    return { ok: true, provider: "BUNNY", videoId: lesson.videoId, embedUrl: await bunnyEmbedUrl(lesson.videoId) };
  }
  return { ok: true, provider: "YOUTUBE", videoId: lesson.videoId, embedUrl: null };
}
