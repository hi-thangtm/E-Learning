import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { getParam, type SearchParams } from "@/lib/table-params";
import { findCourseForEdit } from "../scope";
import { QuestionImportWizard } from "./import-wizard";
import { QUESTION_IMPORT_MAX_ROWS } from "./types";

export const metadata: Metadata = { title: "Import câu hỏi" };

export default async function ImportQuestionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const courseId = getParam(await searchParams, "course");

  // Chỉ người được sửa khoá mới import được; không thì quay lại trang ngân hàng
  const course = await findCourseForEdit(actor, courseId);
  if (!course) redirect(courseId ? `/content/questions?course=${encodeURIComponent(courseId)}` : "/content/questions");

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
          {QUESTION_IMPORT_MAX_ROWS.toLocaleString("vi-VN")} câu, 5MB, định dạng .xlsx.
        </p>
      </div>
      <QuestionImportWizard course={{ id: course.id, label: `${course.code} — ${course.title}` }} />
    </>
  );
}
