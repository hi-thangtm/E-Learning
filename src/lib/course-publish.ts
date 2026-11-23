import "server-only";
import { prisma } from "@/lib/db";
import { getTopicStats, matchingCount } from "@/lib/question-bank";
import { isBlankHtml } from "@/lib/sanitize";

/**
 * Kiểm tra trước khi phát hành khoá học (docs/database.md — Quy tắc 2). Chỉ chạy ở server.
 * Dùng cho hộp "Kiểm tra trước khi phát hành" và kiểm tra lại trong action phát hành.
 * Chỉ xét bài + chương đang dùng (chưa ẩn) — đúng những gì học viên sẽ thấy.
 */

export type PublishCheck = {
  ok: boolean;
  label: string;
  /** Chỗ sửa khi chưa đạt */
  fix?: { href: string; label: string };
};

export type PublishCheckResult = {
  checks: PublishCheck[];
  passed: boolean;
  summary: { sections: number; lessons: number; videos: number; documents: number; quizzes: number; questions: number };
};

type VideoFields = { videoProvider: string | null; videoId: string | null; videoStatus: string | null; durationSeconds: number | null };

/** Lý do bài video CHƯA phát được (null = sẵn sàng). */
function videoBlockReason(l: VideoFields): string | null {
  if (!l.videoProvider || !l.videoId) return "chưa có video";
  if (l.videoStatus === "PROCESSING") return "video đang xử lý";
  if (l.videoStatus === "FAILED") return "video xử lý lỗi";
  if (l.videoStatus !== "READY" || !l.durationSeconds) return "video chưa có thời lượng";
  return null;
}

/**
 * Bài video đang dùng (chương / bài không ẩn) chưa sẵn sàng — chặn phát hành bản cập nhật MINOR / MAJOR / duyệt MAJOR
 * (VD vừa thay video Bunny trên khoá đã phát hành, video còn đang xử lý). Trả danh sách “Chương › Bài: lý do”.
 */
export async function getVideoBlockers(courseId: string): Promise<string[]> {
  const lessons = await prisma.lesson.findMany({
    where: { type: "VIDEO", isArchived: false, section: { courseId, isArchived: false } },
    orderBy: [{ section: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { title: true, videoProvider: true, videoId: true, videoStatus: true, durationSeconds: true, section: { select: { title: true } } },
  });
  return lessons.flatMap((l) => {
    const reason = videoBlockReason(l);
    return reason ? [`${l.section.title} › ${l.title}: ${reason}`] : [];
  });
}

export async function getPublishChecks(courseId: string): Promise<PublishCheckResult> {
  const [sections, bank] = await Promise.all([
    prisma.courseSection.findMany({
      where: { courseId, isArchived: false },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        lessons: {
          where: { isArchived: false },
          orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
          select: {
            title: true,
            type: true,
            videoProvider: true,
            videoId: true,
            videoStatus: true,
            durationSeconds: true,
            content: true,
            fileUrl: true,
            questionTopic: true,
            questionCount: true,
            passingScore: true,
          },
        },
      },
    }),
    getTopicStats(courseId),
  ]);

  const lessons = sections.flatMap((s) => s.lessons);
  const contentFix = { href: `/content/courses/${courseId}?tab=content`, label: "Sửa ở tab Nội dung" };
  const bankFix = { href: `/content/questions?course=${courseId}`, label: "Mở Ngân hàng câu hỏi" };
  const checks: PublishCheck[] = [];

  checks.push(
    lessons.length > 0
      ? { ok: true, label: `Khoá có ${lessons.length} bài học đang dùng` }
      : { ok: false, label: "Khoá chưa có bài học nào (bài / chương đang ẩn không tính)", fix: contentFix },
  );

  for (const l of lessons) {
    if (l.type === "VIDEO") {
      const reason = videoBlockReason(l);
      checks.push(!reason ? { ok: true, label: `Bài ${l.title}: video sẵn sàng` } : { ok: false, label: `Bài ${l.title}: ${reason}`, fix: contentFix });
    } else if (l.type === "DOCUMENT") {
      const ok = (!!l.content && !isBlankHtml(l.content)) || !!l.fileUrl;
      checks.push(
        ok
          ? { ok, label: `Bài ${l.title}: có nội dung tài liệu` }
          : { ok, label: `Bài ${l.title}: chưa có nội dung hoặc file PDF`, fix: contentFix },
      );
    } else {
      const missing = [l.questionCount === null && "số câu rút", l.passingScore === null && "điểm đạt"].filter(Boolean);
      if (missing.length > 0) {
        checks.push({ ok: false, label: `Bài ${l.title}: chưa đặt ${missing.join(" và ")}`, fix: contentFix });
        continue;
      }
      const available = matchingCount(bank, l.questionTopic);
      const topic = l.questionTopic ? `chủ đề “${l.questionTopic}”` : "(tất cả chủ đề)";
      const ok = available >= l.questionCount!;
      checks.push({
        ok,
        label: `Bài ${l.title}: cần ${l.questionCount} câu ${topic}, ngân hàng có ${available} câu đang dùng`,
        ...(!ok && { fix: bankFix }),
      });
    }
  }

  return {
    checks,
    passed: checks.every((c) => c.ok),
    summary: {
      sections: sections.length,
      lessons: lessons.length,
      videos: lessons.filter((l) => l.type === "VIDEO").length,
      documents: lessons.filter((l) => l.type === "DOCUMENT").length,
      quizzes: lessons.filter((l) => l.type === "QUIZ").length,
      questions: bank.total,
    },
  };
}
