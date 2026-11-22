"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/current-user";
import { workbookToBase64 } from "@/lib/excel";
import { findCourseForEdit } from "../scope";
import { analyzeQuestionFile, buildQuestionErrorReport, commitQuestionImport, toPreviewRows } from "./import-service";
import {
  QUESTION_IMPORT_MAX_FILE_BYTES,
  type ConfirmQuestionImportResult,
  type QuestionErrorReportResult,
  type ValidateQuestionImportResult,
} from "./types";

/**
 * Import câu hỏi từ Excel vào khoá đang chọn. Mỗi action nhận lại chính file và kiểm tra lại toàn bộ ở server
 * (không tin kết quả xem trước từ trình duyệt). Chỉ người được sửa khoá (canEditCourse) mới import được.
 */

async function readInput(formData: FormData) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const course = await findCourseForEdit(actor, formData.get("courseId"));
  if (!course) return { ok: false as const, error: "Không tìm thấy khoá học hoặc bạn không có quyền sửa khoá này." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Vui lòng chọn file Excel." };

  // Kiểm tra dung lượng TRƯỚC khi đọc nội dung
  const analyzed = await analyzeQuestionFile(course, {
    name: file.name,
    size: file.size,
    buffer: file.size <= QUESTION_IMPORT_MAX_FILE_BYTES ? await file.arrayBuffer() : new ArrayBuffer(0),
  });
  return { ok: true as const, actor, course, file, analyzed };
}

/** Bước 2: kiểm tra file, không ghi gì. */
export async function validateQuestionImportAction(formData: FormData): Promise<ValidateQuestionImportResult> {
  const input = await readInput(formData);
  if (!input.ok) return { ok: false, message: input.error };
  if ("fileError" in input.analyzed) return { ok: false, message: input.analyzed.fileError };
  return { ok: true, summary: input.analyzed.summary, rows: toPreviewRows(input.analyzed.rows) };
}

/** File gốc + cột “Lỗi” (ô lỗi tô đỏ). */
export async function questionErrorReportAction(formData: FormData): Promise<QuestionErrorReportResult> {
  const input = await readInput(formData);
  if (!input.ok) return { ok: false, message: input.error };
  if ("fileError" in input.analyzed) return { ok: false, message: input.analyzed.fileError };

  const wb = buildQuestionErrorReport(input.analyzed);
  const base = input.file.name.replace(/\.xlsx$/i, "");
  return { ok: true, file: await workbookToBase64(wb), fileName: `${base}-bao-loi.xlsx` };
}

/** Bước 3: kiểm tra lại toàn bộ rồi thêm mới trong 1 transaction. Chỉ ghi khi KHÔNG còn dòng lỗi. */
export async function confirmQuestionImportAction(formData: FormData): Promise<ConfirmQuestionImportResult> {
  const input = await readInput(formData);
  if (!input.ok) return { ok: false, message: input.error };
  if ("fileError" in input.analyzed) return { ok: false, message: input.analyzed.fileError };

  const { actor, course, file, analyzed } = input;
  if (analyzed.summary.error > 0) {
    return {
      ok: false,
      message: `File còn ${analyzed.summary.error} dòng lỗi, chưa import. Hãy sửa rồi kiểm tra lại.`,
      summary: analyzed.summary,
      rows: toPreviewRows(analyzed.rows),
    };
  }

  const created = await commitQuestionImport(actor, course, analyzed.rows, file.name);

  revalidatePath("/content/questions");
  revalidatePath(`/content/courses/${course.id}`);
  return { ok: true, created };
}
