/** Kiểu dữ liệu import câu hỏi — dùng chung server (import-service, actions) và trình duyệt (wizard). */

export type QuestionColumnKey =
  | "topic"
  | "type"
  | "content"
  | "optA"
  | "optB"
  | "optC"
  | "optD"
  | "optE"
  | "optF"
  | "answer"
  | "explanation";

export const QUESTION_COLUMN_KEYS: QuestionColumnKey[] = [
  "topic",
  "type",
  "content",
  "optA",
  "optB",
  "optC",
  "optD",
  "optE",
  "optF",
  "answer",
  "explanation",
];

/** Nhãn cột (không dấu *) — cũng là tiêu đề cột trong file Excel. */
export const QUESTION_COLUMN_LABELS: Record<QuestionColumnKey, string> = {
  topic: "Chủ đề",
  type: "Loại",
  content: "Nội dung",
  optA: "Phương án A",
  optB: "Phương án B",
  optC: "Phương án C",
  optD: "Phương án D",
  optE: "Phương án E",
  optF: "Phương án F",
  answer: "Đáp án đúng",
  explanation: "Giải thích",
};

/** valid = thêm được; warning = thêm được nhưng có cảnh báo (VD trùng nội dung); error = phải sửa. */
export type QuestionImportStatus = "valid" | "warning" | "error";

export type QuestionPreviewRow = {
  /** Số dòng trong Excel (dòng tiêu đề = 1) */
  rowNumber: number;
  values: Record<QuestionColumnKey, string>;
  status: QuestionImportStatus;
  errors: Partial<Record<QuestionColumnKey, string>>;
  warning?: string;
};

export type QuestionImportSummary = {
  total: number;
  valid: number;
  warning: number;
  error: number;
  skippedExamples: number;
};

export type ValidateQuestionImportResult =
  | { ok: false; message: string }
  | { ok: true; summary: QuestionImportSummary; rows: QuestionPreviewRow[] };

export type ConfirmQuestionImportResult =
  | { ok: false; message: string; summary?: QuestionImportSummary; rows?: QuestionPreviewRow[] }
  | { ok: true; created: number };

export type QuestionErrorReportResult = { ok: false; message: string } | { ok: true; file: string; fileName: string };

export const QUESTION_IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const QUESTION_IMPORT_MAX_ROWS = 1000;
