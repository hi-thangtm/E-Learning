import type { QuestionType } from "@prisma/client";
import {
  addListValidation,
  addSimpleSheet,
  createWorkbook,
  freezeRows,
  normalizeHeader,
  safeRow,
  styleHeaderRow,
  type Workbook,
} from "@/lib/excel";
import { OPTION_LETTERS, QUESTION_TYPE_LABELS, type QuestionOption } from "@/lib/question-labels";
import {
  QUESTION_COLUMN_KEYS,
  QUESTION_COLUMN_LABELS,
  QUESTION_IMPORT_MAX_ROWS,
  type QuestionColumnKey,
} from "./import/types";

/**
 * Định dạng file Excel ngân hàng câu hỏi — MỘT định dạng cho file mẫu, file xuất và file import
 * (xuất từ khoá này, sửa, import lại vào khoá khác). Chỉ chạy ở server.
 */

export const QUESTION_SHEET = "Câu hỏi";
export const QUESTION_GUIDE_SHEET = "Hướng dẫn";
/** Dòng có Nội dung bắt đầu bằng chuỗi này là dòng ví dụ — import bỏ qua. */
export const EXAMPLE_MARK = "[VÍ DỤ]";

type ColumnSpec = { key: QuestionColumnKey; required: boolean; width: number; guide: string };

export const QUESTION_COLUMNS: ColumnSpec[] = [
  { key: "topic", required: false, width: 22, guide: "Chủ đề câu hỏi, VD: An toàn điện. Để trống = không có chủ đề. Bài kiểm tra rút câu theo chủ đề." },
  {
    key: "type",
    required: false,
    width: 16,
    guide: `“${QUESTION_TYPE_LABELS.SINGLE}” hoặc “${QUESTION_TYPE_LABELS.MULTIPLE}” (chọn trong danh sách thả xuống). Để trống = tự nhận theo số đáp án đúng.`,
  },
  { key: "content", required: true, width: 60, guide: "Nội dung câu hỏi (tối đa 2.000 ký tự). Xuống dòng trong ô (Alt+Enter) được giữ nguyên." },
  { key: "optA", required: true, width: 30, guide: "Phương án A (bắt buộc)." },
  { key: "optB", required: true, width: 30, guide: "Phương án B (bắt buộc)." },
  { key: "optC", required: false, width: 30, guide: "Phương án C–F không bắt buộc. Điền liên tục từ C, không bỏ trống ở giữa (VD có E thì phải có C, D)." },
  { key: "optD", required: false, width: 30, guide: "Như trên." },
  { key: "optE", required: false, width: 30, guide: "Như trên." },
  { key: "optF", required: false, width: 30, guide: "Như trên." },
  {
    key: "answer",
    required: true,
    width: 14,
    guide: "Chữ cái của đáp án đúng, VD: B. Nhiều đáp án ngăn cách bằng dấu phẩy, VD: A,C. Phải trỏ tới phương án có nội dung.",
  },
  { key: "explanation", required: false, width: 40, guide: "Giải thích (tuỳ chọn) — hiện cho học viên khi xem lại đáp án." },
];

/** Tiêu đề cột trong file: bắt buộc có dấu *. */
export function columnHeader(key: QuestionColumnKey): string {
  const spec = QUESTION_COLUMNS.find((c) => c.key === key)!;
  return `${QUESTION_COLUMN_LABELS[key]}${spec.required ? "*" : ""}`;
}

/** Tiêu đề (đã chuẩn hoá) -> cột. */
export const COLUMN_BY_HEADER = new Map<string, QuestionColumnKey>(
  QUESTION_COLUMN_KEYS.map((k) => [normalizeHeader(QUESTION_COLUMN_LABELS[k]), k]),
);

export const OPTION_KEYS = ["optA", "optB", "optC", "optD", "optE", "optF"] as const satisfies readonly QuestionColumnKey[];

export type QuestionSheetRow = {
  topic: string | null;
  type: QuestionType;
  content: string;
  options: Pick<QuestionOption, "text" | "isCorrect">[];
  explanation: string | null;
};

const EXAMPLES: QuestionSheetRow[] = [
  {
    topic: "An toàn điện",
    type: "SINGLE",
    content: `${EXAMPLE_MARK} Khi phát hiện người bị điện giật, việc đầu tiên cần làm là gì?`,
    options: [
      { text: "Kéo người bị nạn ra bằng tay không", isCorrect: false },
      { text: "Ngắt nguồn điện", isCorrect: true },
      { text: "Gọi điện cho người thân", isCorrect: false },
      { text: "Tạt nước vào người bị nạn", isCorrect: false },
    ],
    explanation: "Phải ngắt nguồn điện trước để tránh bị giật theo.",
  },
  {
    topic: "Phòng cháy",
    type: "MULTIPLE",
    content: `${EXAMPLE_MARK} Những chất nào dùng để dập đám cháy do xăng dầu?`,
    options: [
      { text: "Bột chữa cháy", isCorrect: true },
      { text: "Nước", isCorrect: false },
      { text: "Bọt (foam)", isCorrect: true },
    ],
    explanation: "",
  },
];

/** File mẫu (withExamples) hoặc file xuất câu hỏi của khoá. */
export function buildQuestionWorkbook(rows: QuestionSheetRow[], options: { withExamples: boolean; courseLabel?: string }): Workbook {
  const wb = createWorkbook();
  const ws = wb.addWorksheet(QUESTION_SHEET);
  ws.columns = QUESTION_COLUMNS.map((c) => ({ header: columnHeader(c.key), key: c.key, width: c.width }));
  styleHeaderRow(ws);
  freezeRows(ws);
  // Đáp án đúng dạng chữ (tránh Excel tự đổi "A,C")
  ws.getColumn("answer").numFmt = "@";

  const all = options.withExamples ? [...EXAMPLES, ...rows] : rows;
  for (const [i, q] of all.entries()) {
    // safeRow: nội dung do người soạn nhập — chống chèn công thức
    const row = ws.addRow(safeRow([
      q.topic ?? "",
      QUESTION_TYPE_LABELS[q.type],
      q.content,
      ...OPTION_LETTERS.map((_, idx) => q.options[idx]?.text ?? ""),
      q.options
        .map((o, idx) => (o.isCorrect ? OPTION_LETTERS[idx] : null))
        .filter(Boolean)
        .join(","),
      q.explanation ?? "",
    ]));
    row.alignment = { vertical: "top", wrapText: true };
    if (options.withExamples && i < EXAMPLES.length) row.font = { italic: true, color: { argb: "FF808390" } };
  }

  // Danh sách thả xuống cho cột Loại
  const typeCol = QUESTION_COLUMNS.findIndex((c) => c.key === "type") + 1;
  addListValidation(
    ws,
    typeCol,
    2,
    Math.max(QUESTION_IMPORT_MAX_ROWS, all.length) + 1,
    `"${QUESTION_TYPE_LABELS.SINGLE},${QUESTION_TYPE_LABELS.MULTIPLE}"`,
    `Loại chỉ được: ${QUESTION_TYPE_LABELS.SINGLE} hoặc ${QUESTION_TYPE_LABELS.MULTIPLE}.`,
  );

  // Sheet hướng dẫn
  const guide = addSimpleSheet(
    wb,
    QUESTION_GUIDE_SHEET,
    [
      { header: "Cột", width: 18, value: (c: ColumnSpec) => QUESTION_COLUMN_LABELS[c.key] },
      { header: "Bắt buộc", width: 10, value: (c) => (c.required ? "Có" : "Không") },
      { header: "Hướng dẫn", width: 100, value: (c) => c.guide },
    ],
    QUESTION_COLUMNS,
  );
  guide.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  guide.addRow([]);
  const notes = [
    ...(options.courseLabel ? [`Câu hỏi của khoá: ${options.courseLabel}. Có thể sửa rồi import vào khoá khác.`] : []),
    `Tối đa ${QUESTION_IMPORT_MAX_ROWS.toLocaleString("vi-VN")} câu mỗi file, dung lượng tối đa 5MB, định dạng .xlsx.`,
    `Dòng có Nội dung bắt đầu bằng “${EXAMPLE_MARK}” là dòng ví dụ và sẽ được bỏ qua — có thể xoá đi.`,
    "Mỗi câu có 2–6 phương án, không để trống, không trùng nhau. Một đáp án = đúng 1 đáp án đúng; Nhiều đáp án = ít nhất 1.",
    "Import KHÔNG hỗ trợ ảnh minh hoạ — thêm ảnh sau trong trang Ngân hàng câu hỏi (nút Sửa từng câu).",
    "Import luôn THÊM MỚI câu hỏi (không cập nhật câu đã có). Câu trùng nội dung với câu đã có chỉ được cảnh báo, không bị chặn.",
    "Hệ thống kiểm tra toàn bộ file trước khi lưu. Chỉ lưu khi không còn dòng lỗi.",
  ];
  for (const note of notes) {
    const row = guide.addRow([note]);
    guide.mergeCells(row.number, 1, row.number, 3);
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    row.height = 30;
  }
  return wb;
}
