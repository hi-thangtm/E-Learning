import "server-only";
import ExcelJS from "exceljs";
import { SETTING_META } from "@/lib/settings-meta";

/**
 * Hàm Excel (.xlsx) dùng chung — chỉ chạy ở server. Dùng thư viện exceljs
 * (KHÔNG dùng package `xlsx`/SheetJS bản npm: đã cũ và có lỗ hổng).
 * Dùng cho: import nhân viên (org/users/import), sau này: xuất báo cáo Excel.
 */

export type Workbook = ExcelJS.Workbook;
export type Worksheet = ExcelJS.Worksheet;
export type Cell = ExcelJS.Cell;

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Màu theo docs/design-system.md (ARGB, Excel không dùng được biến CSS)
const HEADER_FILL = "FFE9E7FD"; // primary 16% trên nền trắng
const HEADER_TEXT = "FF444050";
const BORDER = "FFD1D0D4";
export const ERROR_FILL = "FFFFDBDC"; // destructive 16%
export const ERROR_TEXT = "FFE64449";

/** `creator` = tên hệ thống (mặc định lấy từ settings-meta; route xuất có thể truyền tên trong Cài đặt). */
export function createWorkbook(creator: string = SETTING_META.SYSTEM_NAME.default): Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = creator;
  wb.created = new Date();
  return wb;
}

/** Đọc file .xlsx. Ném lỗi nếu không phải file Excel hợp lệ. */
export async function loadWorkbook(data: ArrayBuffer | Buffer): Promise<Workbook> {
  const wb = new ExcelJS.Workbook();
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  // exceljs khai báo kiểu Buffer cũ của Node -> ép kiểu
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

export async function workbookToBuffer(wb: Workbook): Promise<Buffer> {
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

export async function workbookToBase64(wb: Workbook): Promise<string> {
  return (await workbookToBuffer(wb)).toString("base64");
}

/** Response tải file .xlsx (route handler). Tên file tiếng Việt mã hoá theo RFC 5987. */
export function xlsxResponse(buffer: Buffer, fileName: string): Response {
  const ascii = fileName.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e]/g, "_");
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": XLSX_MIME,
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}

// --- Chống chèn công thức (formula / CSV injection) — Việc 29A ------------------------------

/** Ký tự đầu khiến Excel / LibreOffice có thể hiểu ô là công thức: = + - @, tab, xuống dòng. */
const FORMULA_START = /^[=+\-@\t\r\n]/;

/**
 * Ô CHỮ do người dùng nhập (tên, nhận xét, nội dung câu hỏi...) bắt đầu bằng ký tự nguy hiểm → thêm ' ở đầu để luôn là chữ.
 * Mọi chỗ ghi chữ ra Excel phải đi qua hàm này (addSimpleSheet đã tự áp dụng; chỗ ghi ô trực tiếp dùng safeText / safeRow).
 */
export function safeText<T>(value: T): T | string {
  return typeof value === "string" && FORMULA_START.test(value) ? `'${value}` : value;
}

/** safeText cho cả dòng (dùng với ws.addRow). */
export function safeRow<T>(values: T[]): (T | string)[] {
  return values.map(safeText);
}

// --- Đọc ô ---------------------------------------------------------------------------------

/** Giá trị ô dạng chữ (đã trim): xử lý chữ thường, số, rich text, hyperlink, công thức, ngày, đúng/sai. */
export function cellText(cell: Cell | undefined): string {
  if (!cell) return "";
  const text = valueToText(cell.value).trim();
  // Bỏ dấu ' do safeText thêm khi xuất (xuất → nhập lại không đổi nội dung)
  return text.startsWith("'") && FORMULA_START.test(text.slice(1)) ? text.slice(1) : text;
}

function valueToText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return formatDdMmYyyy(value);
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("hyperlink" in value) return typeof value.text === "string" ? value.text : valueToText(value.text as ExcelJS.CellValue);
  if ("result" in value) return valueToText((value.result ?? null) as ExcelJS.CellValue);
  if ("error" in value) return "";
  return String(value);
}

/** Ngày của Excel (lưu nửa đêm UTC) -> dd/MM/yyyy. */
function formatDdMmYyyy(date: Date): string {
  const d = String(date.getUTCDate()).padStart(2, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${d}/${m}/${date.getUTCFullYear()}`;
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Đọc ngày từ ô: nhận kiểu ngày của Excel, số serial (VD: 45292), hoặc chữ dd/MM/yyyy (d/M/yyyy, dấu / - .).
 * Trả `{ value: "yyyy-MM-dd" }`, `{ value: null }` nếu ô trống, hoặc `{ error }` nếu không đọc được.
 */
export function cellDate(cell: Cell | undefined): { value: string | null } | { error: string } {
  if (!cell) return { value: null };
  let raw = cell.value;
  if (raw && typeof raw === "object" && !(raw instanceof Date) && "result" in raw) {
    raw = (raw.result ?? null) as ExcelJS.CellValue;
  }
  if (raw === null || raw === undefined || raw === "") return { value: null };

  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return { error: "Ngày không hợp lệ." };
    return { value: raw.toISOString().slice(0, 10) };
  }
  if (typeof raw === "number") {
    // Số serial Excel: ngày 1 = 1900-01-01 (có lỗi năm nhuận 1900 -> mốc 1899-12-30)
    if (raw < 1 || raw > 2958465) return { error: "Ngày không hợp lệ." };
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000);
    return { value: date.toISOString().slice(0, 10) };
  }

  const text = valueToText(raw).trim();
  if (text === "") return { value: null };
  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (!match) return { error: "Ngày phải theo dạng dd/MM/yyyy (VD: 15/03/2024)." };
  const iso = toIsoDate(Number(match[3]), Number(match[2]), Number(match[1]));
  return iso ? { value: iso } : { error: `Ngày “${text}” không có thật.` };
}

/** Chuẩn hoá tiêu đề cột để so khớp: bỏ dấu, bỏ *, ngoặc, khoảng trắng thừa, chữ thường. */
export function normalizeHeader(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/\(.*?\)/g, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Dòng trống hoàn toàn (mọi ô rỗng). */
export function isRowEmpty(row: ExcelJS.Row, columnCount: number): boolean {
  for (let c = 1; c <= columnCount; c++) {
    if (cellText(row.getCell(c)) !== "") return false;
  }
  return true;
}

// --- Định dạng khi ghi ---------------------------------------------------------------------

/** Dòng tiêu đề: nền tím nhạt, chữ đậm, viền, căn giữa dọc. */
export function styleHeaderRow(ws: Worksheet, rowNumber = 1): void {
  const row = ws.getRow(rowNumber);
  row.height = 24;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: HEADER_TEXT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: BORDER } } };
  });
}

/** Cố định `rows` dòng đầu khi cuộn. */
export function freezeRows(ws: Worksheet, rows = 1): void {
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: rows }];
}

/**
 * Danh sách thả xuống cho các ô của 1 cột (dòng from → to), nguồn là vùng ô ở sheet khác,
 * VD: `'Danh mục'!$A$2:$A$20`. exceljs tự gộp các ô giống nhau thành 1 vùng khi ghi file.
 */
export function addListValidation(
  ws: Worksheet,
  column: number,
  fromRow: number,
  toRow: number,
  sourceRef: string,
  errorMessage: string,
): void {
  for (let r = fromRow; r <= toRow; r++) {
    ws.getCell(r, column).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [sourceRef],
      showErrorMessage: true,
      errorStyle: "error",
      errorTitle: "Giá trị không hợp lệ",
      error: errorMessage,
    };
  }
}

/** Tham chiếu tuyệt đối tới vùng 1 cột ở sheet khác: `'Danh mục'!$A$2:$A$9`. */
export function sheetRangeRef(sheetName: string, column: string, fromRow: number, toRow: number): string {
  return `'${sheetName.replace(/'/g, "''")}'!$${column}$${fromRow}:$${column}$${Math.max(fromRow, toRow)}`;
}

/**
 * Cột của sheet đơn giản. Thuộc tính format:
 * - "percent": giá trị là số 0–100 (VD 85.5) → ghi 0.855, định dạng 0.0%
 * - "date": giá trị Date → định dạng dd/mm/yyyy (ngày giờ Việt Nam)
 * - "datetime": giá trị Date → dd/mm/yyyy hh:mm
 * - "number": số, định dạng #,##0.##
 */
export type SimpleColumn<T> = {
  header: string;
  width?: number;
  format?: "percent" | "date" | "datetime" | "number";
  value: (row: T) => string | number | Date | null;
};

const NUM_FMT = { percent: "0.0%", date: "dd/mm/yyyy", datetime: "dd/mm/yyyy hh:mm", number: "#,##0.##" } as const;
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Excel không có múi giờ: dời Date sang giờ Việt Nam để ô hiển thị đúng ngày. */
function excelValue(value: string | number | Date | null, format: SimpleColumn<unknown>["format"]): string | number | Date | null {
  if (value === null) return null;
  if (format === "percent" && typeof value === "number") return value / 100;
  if (value instanceof Date) return new Date(value.getTime() + VN_OFFSET_MS);
  return safeText(value);
}

/** Thêm sheet bảng đơn giản từ mảng object: tiêu đề đậm tô màu, cố định dòng đầu, định dạng % / ngày theo cột. */
export function addSimpleSheet<T>(wb: Workbook, name: string, columns: SimpleColumn<T>[], rows: T[]): Worksheet {
  const ws = wb.addWorksheet(name);
  ws.columns = columns.map((c) => ({ header: c.header, width: c.width ?? 20, ...(c.format && { style: { numFmt: NUM_FMT[c.format] } }) }));
  for (const row of rows) ws.addRow(columns.map((c) => excelValue(c.value(row), c.format)));
  styleHeaderRow(ws);
  freezeRows(ws);
  return ws;
}
