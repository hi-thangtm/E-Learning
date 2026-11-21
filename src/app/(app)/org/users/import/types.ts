/** Kiểu dữ liệu dùng chung giữa server (import-service, actions) và trình duyệt (wizard). */

export type ImportColumnKey =
  | "employeeCode"
  | "fullName"
  | "email"
  | "phone"
  | "departmentCode"
  | "positionCode"
  | "hireDate"
  | "role";

export type ImportRowStatus = "create" | "update" | "unchanged" | "error";

/** 1 dòng trong bảng xem trước (không chứa dữ liệu nội bộ của server). */
export type ImportPreviewRow = {
  /** Số dòng trong Excel (dòng tiêu đề = 1) */
  rowNumber: number;
  values: Record<ImportColumnKey, string>;
  status: ImportRowStatus;
  errors: Partial<Record<ImportColumnKey, string>>;
};

export type ImportSummary = {
  total: number;
  create: number;
  update: number;
  unchanged: number;
  error: number;
  skippedExamples: number;
};

/** Kết quả kiểm tra file. */
export type ValidateImportResult =
  | { ok: false; message: string }
  | { ok: true; companyCode: string; summary: ImportSummary; rows: ImportPreviewRow[] };

/** Kết quả xác nhận import. */
export type ConfirmImportResult =
  | { ok: false; message: string; summary?: ImportSummary; rows?: ImportPreviewRow[] }
  | {
      ok: true;
      created: number;
      updated: number;
      /** Lỗi giữa chừng: các lô trước đó đã lưu */
      warning?: string;
      /** File danh sách mật khẩu tạm (base64) — chỉ có ở phản hồi này, không lưu ở đâu */
      passwordFile: string | null;
      passwordFileName: string;
    };

export type ErrorReportResult = { ok: false; message: string } | { ok: true; file: string; fileName: string };

// --- Giới hạn + nhãn cột: dùng chung server / trình duyệt (không phụ thuộc Prisma) ---
export const IMPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 2000;

export const IMPORT_COLUMN_LABELS: Record<ImportColumnKey, string> = {
  employeeCode: "Mã NV",
  fullName: "Họ tên",
  email: "Email",
  phone: "Điện thoại",
  departmentCode: "Phòng ban",
  positionCode: "Chức danh",
  hireDate: "Ngày vào làm",
  role: "Vai trò",
};
