import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { parseOptions } from "@/lib/question-bank";
import { buildQuestionWorkbook } from "../excel-format";
import { findCourseForView } from "../scope";

/**
 * Xuất toàn bộ câu hỏi của 1 khoá (kể cả câu đã tắt) theo ĐÚNG định dạng file mẫu:
 * GET /content/questions/export?course=<id>. Xem được khoá (Quy tắc 1) là xuất được.
 */
export async function GET(request: Request) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const course = await findCourseForView(actor, new URL(request.url).searchParams.get("course"));
  if (!course) {
    return new Response("Không tìm thấy khoá học hoặc bạn không có quyền xem.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const questions = await prisma.question.findMany({
    where: { courseId: course.id },
    orderBy: [{ topic: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    select: { topic: true, type: true, content: true, options: true, explanation: true },
  });

  const wb = buildQuestionWorkbook(
    questions.map((q) => ({
      topic: q.topic,
      type: q.type,
      content: q.content,
      options: parseOptions(q.options),
      explanation: q.explanation,
    })),
    { withExamples: false, courseLabel: `${course.code} — ${course.title}` },
  );
  return xlsxResponse(await workbookToBuffer(wb), `cau-hoi-${course.code}.xlsx`);
}
