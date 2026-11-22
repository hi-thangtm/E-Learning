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
      const ok = !!l.videoProvider && !!l.videoId && l.videoStatus === "READY" && !!l.durationSeconds;
      const reason = !l.videoProvider || !l.videoId
        ? "chưa có video"
        : l.videoStatus === "PROCESSING"
          ? "video đang xử lý"
          : l.videoStatus === "FAILED"
            ? "video xử lý lỗi"
            : "video chưa có thời lượng";
      checks.push(ok ? { ok, label: `Bài ${l.title}: video sẵn sàng` } : { ok, label: `Bài ${l.title}: ${reason}`, fix: contentFix });
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
