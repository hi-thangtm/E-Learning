import type { QuestionType } from "@prisma/client";
import type { CurrentUser } from "@/lib/current-user";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  cellText,
  ERROR_FILL,
  ERROR_TEXT,
  isRowEmpty,
  loadWorkbook,
  normalizeHeader,
  safeText,
  type Workbook,
  type Worksheet,
} from "@/lib/excel";
import { assignOptionIds, normalizeQuestionText, questionInputSchema, type QuestionInput } from "@/lib/question-bank";
import { OPTION_LETTERS, QUESTION_TYPE_LABELS } from "@/lib/question-labels";
import { COLUMN_BY_HEADER, EXAMPLE_MARK, OPTION_KEYS, QUESTION_GUIDE_SHEET, QUESTION_SHEET } from "../excel-format";
import type { EditableCourse } from "../scope";
import {
  QUESTION_COLUMN_KEYS,
  QUESTION_COLUMN_LABELS,
  QUESTION_IMPORT_MAX_FILE_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
  type QuestionColumnKey,
  type QuestionImportSummary,
  type QuestionPreviewRow,
} from "./types";
import { formatNumber } from "@/lib/format";

/**
 * Import câu hỏi từ Excel vào 1 khoá — chỉ chạy ở server.
 * Mỗi bước (kiểm tra, tải file báo lỗi, xác nhận) đọc lại chính file và kiểm tra lại toàn bộ.
 * Quy tắc từng câu giống hệt form thêm câu hỏi (questionInputSchema).
 */

const REQUIRED: QuestionColumnKey[] = ["content", "optA", "optB", "answer"];

export type AnalyzedQuestionRow = QuestionPreviewRow & { data?: QuestionInput };

export type QuestionAnalyzeResult =
  | { fileError: string }
  | {
      rows: AnalyzedQuestionRow[];
      summary: QuestionImportSummary;
      workbook: Workbook;
      sheet: Worksheet;
      columnIndex: Map<QuestionColumnKey, number>;
    };

const TYPE_BY_TEXT = new Map<string, QuestionType>([
  [normalizeHeader(QUESTION_TYPE_LABELS.SINGLE), "SINGLE"],
  [normalizeHeader(QUESTION_TYPE_LABELS.MULTIPLE), "MULTIPLE"],
  ["single", "SINGLE"],
  ["multiple", "MULTIPLE"],
]);

function findDataSheet(wb: Workbook): Worksheet | undefined {
  return wb.getWorksheet(QUESTION_SHEET) ?? wb.worksheets.find((s) => s.name !== QUESTION_GUIDE_SHEET) ?? wb.worksheets[0];
}

/** Đọc ô "Đáp án đúng": "B", "A,C", "a; c", "A C" -> chỉ số phương án. */
function parseAnswer(text: string): { indexes: number[] } | { error: string } {
  const parts = text
    .toUpperCase()
    .split(/[\s,;]+/)
    .filter(Boolean);
  if (parts.length === 0) return { error: "Vui lòng nhập đáp án đúng (VD: B hoặc A,C)." };
  const indexes: number[] = [];
  for (const p of parts) {
    const i = (OPTION_LETTERS as readonly string[]).indexOf(p);
    if (i < 0) return { error: `“${p}” không phải phương án hợp lệ (chỉ A–F).` };
    if (indexes.includes(i)) return { error: `Phương án ${p} bị ghi lặp.` };
    indexes.push(i);
  }
  return { indexes };
}

/** Kiểm tra 1 dòng: trả lỗi theo cột hoặc dữ liệu đã chuẩn hoá. */
function analyzeRow(values: Record<QuestionColumnKey, string>): {
  errors: Partial<Record<QuestionColumnKey, string>>;
  data?: QuestionInput;
} {
  const errors: Partial<Record<QuestionColumnKey, string>> = {};
  for (const key of REQUIRED) {
    if (values[key] === "") errors[key] = "Bắt buộc.";
  }

  // Phương án: điền liên tục, không bỏ trống ở giữa
  const texts = OPTION_KEYS.map((k) => values[k]);
  const lastFilled = texts.reduce((last, t, i) => (t !== "" ? i : last), -1);
  for (let i = 2; i < lastFilled; i++) {
    if (texts[i] === "") errors[OPTION_KEYS[i]] = "Không được bỏ trống phương án ở giữa.";
  }

  // Đáp án đúng phải trỏ tới phương án có nội dung
  let correct: number[] = [];
  if (values.answer !== "") {
    const parsed = parseAnswer(values.answer);
    if ("error" in parsed) errors.answer = parsed.error;
    else {
      const empty = parsed.indexes.filter((i) => texts[i] === "");
      if (empty.length > 0) {
        errors.answer = `Phương án ${empty.map((i) => OPTION_LETTERS[i]).join(", ")} không có nội dung.`;
      }
      correct = parsed.indexes;
    }
  }

  // Loại: trống -> suy ra từ số đáp án đúng
  let type: QuestionType | undefined;
  if (values.type === "") type = correct.length > 1 ? "MULTIPLE" : "SINGLE";
  else {
    type = TYPE_BY_TEXT.get(normalizeHeader(values.type));
    if (!type) errors.type = `Chỉ được “${QUESTION_TYPE_LABELS.SINGLE}” hoặc “${QUESTION_TYPE_LABELS.MULTIPLE}”.`;
  }
  if (type === "SINGLE" && correct.length > 1 && !errors.answer) {
    errors.answer = `Loại “${QUESTION_TYPE_LABELS.SINGLE}” chỉ được có 1 đáp án đúng.`;
  }

  if (Object.keys(errors).length > 0) return { errors };

  const parsed = questionInputSchema.safeParse({
    content: values.content,
    topic: values.topic,
    type,
    options: texts.slice(0, lastFilled + 1).map((text, i) => ({ text, isCorrect: correct.includes(i) })),
    explanation: values.explanation,
  });
  if (parsed.success) return { errors, data: parsed.data };

  for (const issue of parsed.error.issues) {
    const field = String(issue.path[0] ?? "");
    let key: QuestionColumnKey = "content";
    if (field === "topic" || field === "explanation" || field === "content" || field === "type") key = field;
    else if (field === "options") {
      // "Phương án C trùng với…" -> tô ô Phương án C; lỗi về đáp án đúng -> ô Đáp án đúng
      const letter = /Phương án ([A-F])/.exec(issue.message)?.[1];
      const index = issue.path[1];
      key =
        typeof index === "number" && OPTION_KEYS[index]
          ? OPTION_KEYS[index]
          : letter
            ? OPTION_KEYS[OPTION_LETTERS.indexOf(letter as (typeof OPTION_LETTERS)[number])]
            : "answer";
    }
    if (!errors[key]) errors[key] = issue.message;
  }
  return { errors };
}

/** Kiểm tra file (không ghi gì). */
export async function analyzeQuestionFile(
  course: EditableCourse,
  file: { name: string; size: number; buffer: ArrayBuffer | Buffer },
): Promise<QuestionAnalyzeResult> {
  if (!/\.xlsx$/i.test(file.name)) return { fileError: "Chỉ nhận file Excel định dạng .xlsx." };
  if (file.size === 0) return { fileError: "File rỗng." };
  if (file.size > QUESTION_IMPORT_MAX_FILE_BYTES) return { fileError: "File vượt quá 5MB." };

  let workbook: Workbook;
  try {
    workbook = await loadWorkbook(file.buffer);
  } catch {
    return { fileError: "Không đọc được file. Hãy lưu lại bằng Excel dưới dạng .xlsx rồi thử lại." };
  }
  const sheet = findDataSheet(workbook);
  if (!sheet) return { fileError: "File không có sheet dữ liệu." };

  // Tìm cột theo tiêu đề dòng 1 (không phụ thuộc thứ tự cột)
  const columnIndex = new Map<QuestionColumnKey, number>();
  const header = sheet.getRow(1);
  const headerCount = Math.max(sheet.actualColumnCount, header.cellCount);
  for (let c = 1; c <= headerCount; c++) {
    const key = COLUMN_BY_HEADER.get(normalizeHeader(cellText(header.getCell(c))));
    if (key && !columnIndex.has(key)) columnIndex.set(key, c);
  }
  const missing = REQUIRED.filter((k) => !columnIndex.has(k)).map((k) => QUESTION_COLUMN_LABELS[k]);
  if (missing.length > 0) return { fileError: `Thiếu cột bắt buộc: ${missing.join(", ")}. Hãy dùng file mẫu.` };

  // Gom dòng dữ liệu (bỏ dòng trống, dòng ví dụ)
  const raw: { rowNumber: number; values: Record<QuestionColumnKey, string> }[] = [];
  let skippedExamples = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (isRowEmpty(row, headerCount)) continue;
    const values = Object.fromEntries(
      QUESTION_COLUMN_KEYS.map((k) => {
        const c = columnIndex.get(k);
        // Nội dung / giải thích giữ xuống dòng; chuẩn hoá \r\n
        return [k, c ? cellText(row.getCell(c)).replace(/\r\n?/g, "\n") : ""];
      }),
    ) as Record<QuestionColumnKey, string>;
    if (values.content.startsWith(EXAMPLE_MARK)) {
      skippedExamples++;
      continue;
    }
    raw.push({ rowNumber: r, values });
    if (raw.length > QUESTION_IMPORT_MAX_ROWS) {
      return {
        fileError: `File có hơn ${formatNumber(QUESTION_IMPORT_MAX_ROWS)} câu hỏi. Hãy chia thành nhiều file.`,
      };
    }
  }
  if (raw.length === 0) {
    return { fileError: `File không có câu hỏi nào (dòng ví dụ “${EXAMPLE_MARK}” được bỏ qua).` };
  }

  // Cảnh báo trùng nội dung: so với ngân hàng của khoá (kể cả câu đã tắt) và các dòng trước trong file
  const existing = await prisma.question.findMany({ where: { courseId: course.id }, select: { content: true } });
  const seen = new Set(existing.map((q) => normalizeQuestionText(q.content)));
  const seenInFile = new Map<string, number>();

  const rows: AnalyzedQuestionRow[] = raw.map(({ rowNumber, values }) => {
    const { errors, data } = analyzeRow(values);
    if (!data) return { rowNumber, values, status: "error", errors };

    const key = normalizeQuestionText(data.content);
    let warning: string | undefined;
    if (seen.has(key)) warning = "Trùng nội dung với câu đã có trong ngân hàng của khoá.";
    else if (seenInFile.has(key)) warning = `Trùng nội dung với dòng ${seenInFile.get(key)} trong file.`;
    seenInFile.set(key, seenInFile.get(key) ?? rowNumber);

    return { rowNumber, values, status: warning ? "warning" : "valid", errors, warning, data };
  });

  const summary: QuestionImportSummary = {
    total: rows.length,
    valid: rows.filter((r) => r.status === "valid").length,
    warning: rows.filter((r) => r.status === "warning").length,
    error: rows.filter((r) => r.status === "error").length,
    skippedExamples,
  };
  return { rows, summary, workbook, sheet, columnIndex };
}

/** Bỏ phần chỉ dùng ở server trước khi trả về trình duyệt. */
export function toPreviewRows(rows: AnalyzedQuestionRow[]): QuestionPreviewRow[] {
  return rows.map(({ rowNumber, values, status, errors, warning }) => ({ rowNumber, values, status, errors, warning }));
}

/** File báo lỗi: file gốc + cột “Lỗi” cuối sheet, ô lỗi tô đỏ. */
export function buildQuestionErrorReport(result: Extract<QuestionAnalyzeResult, { rows: AnalyzedQuestionRow[] }>): Workbook {
  const { workbook, sheet, columnIndex, rows } = result;
  const errorCol = Math.max(sheet.actualColumnCount, sheet.getRow(1).cellCount) + 1;

  const headerCell = sheet.getCell(1, errorCol);
  headerCell.value = "Lỗi";
  headerCell.font = { bold: true, color: { argb: ERROR_TEXT } };
  headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ERROR_FILL } };
  sheet.getColumn(errorCol).width = 60;

  for (const row of rows) {
    const entries = Object.entries(row.errors) as [QuestionColumnKey, string][];
    if (entries.length === 0) continue;
    for (const [key] of entries) {
      const c = columnIndex.get(key);
      if (!c) continue;
      const cell = sheet.getCell(row.rowNumber, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ERROR_FILL } };
      cell.font = { ...(cell.font ?? {}), color: { argb: ERROR_TEXT } };
    }
    const cell = sheet.getCell(row.rowNumber, errorCol);
    cell.value = safeText(entries.map(([key, message]) => `${QUESTION_COLUMN_LABELS[key]}: ${message}`).join("\n"));
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = { color: { argb: ERROR_TEXT } };
  }
  return workbook;
}

/** Thêm mới toàn bộ câu hợp lệ trong 1 transaction + ghi nhật ký. */
export async function commitQuestionImport(
  actor: CurrentUser,
  course: EditableCourse,
  rows: AnalyzedQuestionRow[],
  fileName: string,
): Promise<number> {
  const data = rows.flatMap((r) => (r.data ? [r.data] : []));
  await prisma.$transaction([
    prisma.question.createMany({
      data: data.map((q) => ({
        courseId: course.id,
        topic: q.topic,
        type: q.type,
        content: q.content,
        options: assignOptionIds(q.options),
        explanation: q.explanation,
        isAiCreated: false,
        isApproved: true,
      })),
    }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: course.ownerCompanyId,
      action: "QUESTIONS_IMPORTED",
      entityType: "Course",
      entityId: course.id,
      metadata: { courseCode: course.code, fileName: fileName.slice(0, 200), count: data.length },
    }),
  ]);
  return data.length;
}
