import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { getParam, type SearchParams } from "@/lib/table-params";
import { findCourseForEdit } from "../scope";
import { QuestionImportWizard } from "./import-wizard";
import { QUESTION_IMPORT_MAX_ROWS } from "./types";
import { formatNumber } from "@/lib/format";
import { findCourseInScope } from "@/lib/course-scope";

export const metadata: Metadata = { title: "Import câu hỏi" };

export default async function ImportQuestionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const courseId = getParam(await searchParams, "course");

  // Chỉ người được sửa khoá mới import được: chưa chọn khoá → về ngân hàng; khoá xem được nhưng không sửa được → về ngân hàng (chế độ chỉ xem);
  // khoá ngoài phạm vi / không tồn tại → “Không tìm thấy” (ui-review #31)
  if (!courseId) redirect("/content/questions");
  const course = await findCourseForEdit(actor, courseId);
  if (!course) {
    if (await findCourseInScope(actor, courseId, { id: true })) redirect(`/content/questions?course=${encodeURIComponent(courseId)}`);
    notFound();
  }

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link
          href={`/content/questions?course=${course.id}`}
          className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Ngân hàng câu hỏi
        </Link>
        <h1 className="text-2xl font-medium text-foreground">Import câu hỏi từ Excel</h1>
        <p className="text-[15px] text-muted-foreground">
          Tải file mẫu, điền câu hỏi, tải lên để kiểm tra. Hệ thống chỉ lưu khi file không còn dòng lỗi. Tối đa{" "}
          {formatNumber(QUESTION_IMPORT_MAX_ROWS)} câu, 5MB, định dạng .xlsx.
        </p>
      </div>
      <QuestionImportWizard course={{ id: course.id, label: `${course.code} — ${course.title}` }} />
    </>
  );
}
