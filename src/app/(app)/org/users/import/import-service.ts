import bcrypt from "bcryptjs";
import { Prisma, type Role } from "@prisma/client";
import { onUserOrgChanged } from "@/lib/assignment";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import {
  addListValidation,
  cellDate,
  cellText,
  createWorkbook,
  ERROR_FILL,
  ERROR_TEXT,
  isRowEmpty,
  loadWorkbook,
  normalizeHeader,
  sheetRangeRef,
  styleHeaderRow,
  addSimpleSheet,
  type Workbook,
  type Worksheet,
} from "@/lib/excel";
import { generateTempPassword } from "@/lib/password";
import { ROLE_LABELS } from "@/lib/roles";
import {
  EMAIL_MAX,
  EMPLOYEE_CODE_MESSAGE,
  EMPLOYEE_CODE_REGEX,
  FULL_NAME_MAX,
  FULL_NAME_MIN,
  fromDbDate,
  isValidEmail,
  isValidHireDate,
  PHONE_MESSAGE,
  PHONE_REGEX,
  toDbDate,
} from "@/lib/user-rules";
import {
  IMPORT_MAX_FILE_BYTES,
  IMPORT_MAX_ROWS,
  type ImportColumnKey,
  type ImportPreviewRow,
  type ImportSummary,
} from "./types";
import { logAudit } from "@/lib/audit";

/**
 * Lõi import nhân viên từ Excel (docs/database.md — Quy tắc 1, 5). KHÔNG phải server action:
 * nhận `actor` làm tham số để gọi được từ actions.ts (đã requireRole) và từ script đo thời gian.
 * - Kiểm tra lại toàn bộ ở server mỗi lần (xem trước / xác nhận / file báo lỗi), không tin dữ liệu từ trình duyệt.
 * - Mã chưa có -> tạo mới; có trong cùng công ty -> cập nhật 6 trường; có ở công ty khác -> lỗi.
 * - Mật khẩu tạm: tự sinh 10 ký tự, bcrypt cost 10 (người dùng bắt buộc đổi ở lần đăng nhập đầu), không lưu ở đâu.
 */

export const IMPORT_SHEET = "Nhân viên";
export const CATALOG_SHEET = "Danh mục";
export const GUIDE_SHEET = "Hướng dẫn";
export const MAX_FILE_BYTES = IMPORT_MAX_FILE_BYTES;
export const MAX_ROWS = IMPORT_MAX_ROWS;
const BATCH_SIZE = 100;
const IMPORT_BCRYPT_COST = 10;
/** Dòng có mã bắt đầu bằng tiền tố này là dòng ví dụ của file mẫu -> bỏ qua */
export const EXAMPLE_PREFIX = "VD-";

export const IMPORTABLE_ROLES: Role[] = ["LEARNER", "MANAGER", "CONTENT_EDITOR"];

export type ImportColumn = {
  key: ImportColumnKey;
  header: string;
  required: boolean;
  width: number;
  /** Các tiêu đề được chấp nhận (đã chuẩn hoá bằng normalizeHeader) */
  aliases: string[];
  guide: string;
  examples: [string, string];
};

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    key: "employeeCode",
    header: "Mã NV*",
    required: true,
    width: 16,
    aliases: ["ma nv", "ma nhan vien"],
    guide:
      "Bắt buộc. Là tên đăng nhập, duy nhất toàn tập đoàn. Chữ không dấu, số, dấu chấm, gạch ngang, gạch dưới (2–30 ký tự); tự chuyển in hoa.",
    examples: ["VD-001", "VD-002"],
  },
  {
    key: "fullName",
    header: "Họ tên*",
    required: true,
    width: 26,
    aliases: ["ho ten", "ho va ten"],
    guide: "Bắt buộc. 2–100 ký tự, tiếng Việt có dấu.",
    examples: ["Nguyễn Văn An", "Trần Thị Bình"],
  },
  {
    key: "email",
    header: "Email",
    required: false,
    width: 28,
    aliases: ["email", "e-mail", "thu dien tu"],
    guide: "Không bắt buộc. Đúng định dạng email.",
    examples: ["an.nguyen@congty.vn", ""],
  },
  {
    key: "phone",
    header: "Điện thoại",
    required: false,
    width: 16,
    aliases: ["dien thoai", "so dien thoai", "sdt"],
    guide: "Không bắt buộc. 8–20 chữ số, được có dấu cách, dấu chấm, dấu +.",
    examples: ["0901 234 567", ""],
  },
  {
    key: "departmentCode",
    header: "Mã phòng ban",
    required: false,
    width: 32,
    aliases: ["ma phong ban", "phong ban"],
    guide: "Không bắt buộc. Chọn từ danh sách (sheet “Danh mục”) hoặc gõ mã. Phải là phòng ban đang dùng của công ty trong file.",
    examples: ["", ""],
  },
  {
    key: "positionCode",
    header: "Mã chức danh",
    required: false,
    width: 32,
    aliases: ["ma chuc danh", "chuc danh"],
    guide: "Không bắt buộc. Chọn từ danh sách hoặc gõ mã. Phải là chức danh đang dùng.",
    examples: ["", ""],
  },
  {
    key: "hireDate",
    header: "Ngày vào làm (dd/MM/yyyy)",
    required: false,
    width: 24,
    aliases: ["ngay vao lam"],
    guide: "Không bắt buộc. Dạng dd/MM/yyyy, VD: 15/03/2024. Nhận cả ô kiểu ngày của Excel.",
    examples: ["15/03/2024", "01/10/2023"],
  },
  {
    key: "role",
    header: "Vai trò",
    required: false,
    width: 22,
    aliases: ["vai tro"],
    guide: "Không bắt buộc. Chỉ: Học viên / Quản lý / Biên soạn nội dung. Để trống = Học viên. Không đổi vai trò của người đã có.",
    examples: ["Học viên", "Quản lý"],
  },
];

// ---------------------------------------------------------------------------------------------
// Công ty của file

export type ImportCompany = { id: string; code: string; name: string };

/** Admin công ty: luôn công ty mình (bỏ qua giá trị gửi lên). Admin tập đoàn: công ty phải tồn tại và đang hoạt động. */
export async function resolveImportCompany(
  actor: CurrentUser,
  requestedId: string | null | undefined,
): Promise<ImportCompany | { error: string }> {
  const companyId = actor.role === "GROUP_ADMIN" ? requestedId?.trim() : actor.companyId;
  if (!companyId) return { error: "Vui lòng chọn công ty." };
  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, code: true, name: true, isActive: true },
  });
  if (!company) return { error: "Công ty không tồn tại." };
  if (!company.isActive) return { error: "Công ty đang tạm ngưng, không import được." };
  return { id: company.id, code: company.code, name: company.name };
}

async function loadCatalog(companyId: string) {
  const [departments, positions] = await Promise.all([
    prisma.department.findMany({
      where: { companyId },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, isActive: true },
    }),
    prisma.position.findMany({
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, isActive: true },
    }),
  ]);
  return { departments, positions };
}

/** Giá trị trong danh sách thả xuống có dạng “MÃ – Tên” -> lấy phần mã. */
function codeFromOption(text: string): string {
  return text.split(/\s+[–—-]\s+/)[0].trim().toUpperCase();
}

const roleByNormalized = new Map<string, Role>(
  IMPORTABLE_ROLES.flatMap((r) => [
    [normalizeHeader(ROLE_LABELS[r]), r],
    [r.toLowerCase(), r],
  ]),
);

// ---------------------------------------------------------------------------------------------
// Tạo file mẫu

export async function buildTemplateWorkbook(company: ImportCompany): Promise<Workbook> {
  const { departments, positions } = await loadCatalog(company.id);
  const activeDepartments = departments.filter((d) => d.isActive);
  const activePositions = positions.filter((p) => p.isActive);

  const wb = createWorkbook();

  // --- Sheet chính ---
  const ws = wb.addWorksheet(IMPORT_SHEET, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  styleHeaderRow(ws);
  // Mã NV, điện thoại, ngày: định dạng chữ để Excel không tự đổi (mất số 0 đầu, đổi kiểu ngày theo máy)
  for (const key of ["employeeCode", "phone", "hireDate"] as const) ws.getColumn(key).numFmt = "@";
  for (const i of [0, 1] as const) {
    const row = ws.addRow(IMPORT_COLUMNS.map((c) => c.examples[i]));
    row.font = { italic: true, color: { argb: "FF808390" } };
  }

  // --- Sheet danh mục (nguồn cho danh sách thả xuống) ---
  const cat = wb.addWorksheet(CATALOG_SHEET);
  cat.columns = [
    { header: "Phòng ban (mã – tên)", width: 40 },
    { header: "Chức danh (mã – tên)", width: 40 },
    { header: "Vai trò", width: 22 },
  ];
  const catRows = Math.max(activeDepartments.length, activePositions.length, IMPORTABLE_ROLES.length);
  for (let i = 0; i < catRows; i++) {
    const d = activeDepartments[i];
    const p = activePositions[i];
    const r = IMPORTABLE_ROLES[i];
    cat.addRow([d ? `${d.code} – ${d.name}` : null, p ? `${p.code} – ${p.name}` : null, r ? ROLE_LABELS[r] : null]);
  }
  styleHeaderRow(cat);

  const colIndex = (key: ImportColumnKey) => IMPORT_COLUMNS.findIndex((c) => c.key === key) + 1;
  const lastDataRow = MAX_ROWS + 1;
  if (activeDepartments.length > 0) {
    addListValidation(
      ws,
      colIndex("departmentCode"),
      2,
      lastDataRow,
      sheetRangeRef(CATALOG_SHEET, "A", 2, activeDepartments.length + 1),
      "Chọn phòng ban trong danh sách (sheet “Danh mục”).",
    );
  }
  if (activePositions.length > 0) {
    addListValidation(
      ws,
      colIndex("positionCode"),
      2,
      lastDataRow,
      sheetRangeRef(CATALOG_SHEET, "B", 2, activePositions.length + 1),
      "Chọn chức danh trong danh sách (sheet “Danh mục”).",
    );
  }
  addListValidation(
    ws,
    colIndex("role"),
    2,
    lastDataRow,
    sheetRangeRef(CATALOG_SHEET, "C", 2, IMPORTABLE_ROLES.length + 1),
    "Vai trò chỉ được: Học viên, Quản lý, Biên soạn nội dung.",
  );

  // --- Sheet hướng dẫn ---
  const guide = addSimpleSheet(
    wb,
    GUIDE_SHEET,
    [
      { header: "Cột", width: 28, value: (c: ImportColumn) => c.header.replace("*", "") },
      { header: "Bắt buộc", width: 10, value: (c) => (c.required ? "Có" : "Không") },
      { header: "Hướng dẫn", width: 90, value: (c) => c.guide },
    ],
    IMPORT_COLUMNS,
  );
  guide.getColumn(3).alignment = { wrapText: true, vertical: "top" };
  guide.addRow([]);
  const notes = [
    `File này dành cho công ty: ${company.code} — ${company.name}. Mỗi file chỉ import cho 1 công ty.`,
    `Tối đa ${MAX_ROWS.toLocaleString("vi-VN")} dòng, dung lượng tối đa 5MB, định dạng .xlsx.`,
    `Các dòng có Mã NV bắt đầu bằng “${EXAMPLE_PREFIX}” là dòng ví dụ và sẽ được bỏ qua — có thể xoá đi.`,
    "Mã NV chưa có trong hệ thống → TẠO MỚI (mật khẩu tạm tự sinh, bắt đổi khi đăng nhập lần đầu).",
    "Mã NV đã có trong công ty này → CẬP NHẬT họ tên, email, điện thoại, phòng ban, chức danh, ngày vào làm. Ô trống = giữ nguyên giá trị cũ. Không đổi vai trò, trạng thái, mật khẩu.",
    "Mã NV đã thuộc công ty khác → LỖI (muốn chuyển công ty hãy sửa trực tiếp trên trang Người dùng).",
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

// ---------------------------------------------------------------------------------------------
// Đọc + kiểm tra file

type ParsedRow = {
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  departmentId: string | null;
  departmentName: string | null;
  positionId: string | null;
  hireDate: string | null;
  role: Role;
};

export type AnalyzedRow = ImportPreviewRow & {
  /** Có khi status = create / update */
  data?: ParsedRow;
  /** status = update: id người đã có + phần thay đổi */
  existingId?: string;
  changes?: Prisma.UserUpdateManyMutationInput & { departmentId?: string | null; positionId?: string | null };
  orgChanged?: boolean;
};

export type AnalyzeResult =
  | { fileError: string }
  | { rows: AnalyzedRow[]; summary: ImportSummary; workbook: Workbook; sheet: Worksheet; columnIndex: Map<ImportColumnKey, number> };

function findDataSheet(wb: Workbook): Worksheet | undefined {
  return (
    wb.getWorksheet(IMPORT_SHEET) ??
    wb.worksheets.find((s) => s.name !== CATALOG_SHEET && s.name !== GUIDE_SHEET) ??
    wb.worksheets[0]
  );
}

/** Kiểm tra file (không ghi gì). `fileName` / `size` để kiểm tra đuôi và dung lượng. */
export async function analyzeImportFile(
  actor: CurrentUser,
  company: ImportCompany,
  file: { name: string; size: number; buffer: ArrayBuffer | Buffer },
): Promise<AnalyzeResult> {
  if (!/\.xlsx$/i.test(file.name)) return { fileError: "Chỉ nhận file Excel định dạng .xlsx." };
  if (file.size === 0) return { fileError: "File rỗng." };
  if (file.size > MAX_FILE_BYTES) return { fileError: "File vượt quá 5MB." };

  let workbook: Workbook;
  try {
    workbook = await loadWorkbook(file.buffer);
  } catch {
    return { fileError: "Không đọc được file. Hãy lưu lại bằng Excel dưới dạng .xlsx rồi thử lại." };
  }
  const sheet = findDataSheet(workbook);
  if (!sheet) return { fileError: "File không có sheet dữ liệu." };

  // Tìm cột theo tiêu đề dòng 1 (không phụ thuộc thứ tự cột)
  const columnIndex = new Map<ImportColumnKey, number>();
  const header = sheet.getRow(1);
  const headerCount = Math.max(sheet.actualColumnCount, header.cellCount);
  for (let c = 1; c <= headerCount; c++) {
    const text = normalizeHeader(cellText(header.getCell(c)));
    const column = IMPORT_COLUMNS.find((col) => col.aliases.includes(text));
    if (column && !columnIndex.has(column.key)) columnIndex.set(column.key, c);
  }
  const missing = IMPORT_COLUMNS.filter((c) => c.required && !columnIndex.has(c.key)).map((c) => c.header.replace("*", ""));
  if (missing.length > 0) {
    return { fileError: `Thiếu cột bắt buộc: ${missing.join(", ")}. Hãy dùng file mẫu.` };
  }

  // Gom các dòng dữ liệu (bỏ dòng trống, dòng ví dụ)
  const raw: { rowNumber: number; get: (key: ImportColumnKey) => ReturnType<Worksheet["getCell"]> | undefined }[] = [];
  let skippedExamples = 0;
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    if (isRowEmpty(row, headerCount)) continue;
    const get = (key: ImportColumnKey) => {
      const c = columnIndex.get(key);
      return c ? row.getCell(c) : undefined;
    };
    if (cellText(get("employeeCode")).toUpperCase().startsWith(EXAMPLE_PREFIX)) {
      skippedExamples++;
      continue;
    }
    raw.push({ rowNumber: r, get });
    if (raw.length > MAX_ROWS) {
      return { fileError: `File có hơn ${MAX_ROWS.toLocaleString("vi-VN")} dòng dữ liệu. Hãy chia thành nhiều file.` };
    }
  }
  if (raw.length === 0) {
    return { fileError: "File không có dòng dữ liệu nào (dòng ví dụ “VD-…” được bỏ qua)." };
  }

  const { departments, positions } = await loadCatalog(company.id);
  const departmentByCode = new Map(departments.map((d) => [d.code.toUpperCase(), d]));
  const positionByCode = new Map(positions.map((p) => [p.code.toUpperCase(), p]));

  // --- Bước 1: đọc + kiểm tra từng ô ---
  const rows: AnalyzedRow[] = raw.map(({ rowNumber, get }) => {
    const values = Object.fromEntries(
      IMPORT_COLUMNS.map((c) => [c.key, c.key === "hireDate" ? dateDisplay(get("hireDate")) : cellText(get(c.key))]),
    ) as Record<ImportColumnKey, string>;
    const errors: Partial<Record<ImportColumnKey, string>> = {};

    const employeeCode = values.employeeCode.toUpperCase();
    if (!employeeCode) errors.employeeCode = "Thiếu mã nhân viên.";
    else if (!EMPLOYEE_CODE_REGEX.test(employeeCode)) errors.employeeCode = EMPLOYEE_CODE_MESSAGE;

    const fullName = values.fullName.replace(/\s+/g, " ");
    if (!fullName) errors.fullName = "Thiếu họ tên.";
    else if (fullName.length < FULL_NAME_MIN || fullName.length > FULL_NAME_MAX) {
      errors.fullName = `Họ tên ${FULL_NAME_MIN}–${FULL_NAME_MAX} ký tự.`;
    }

    const email = values.email ? values.email.toLowerCase() : null;
    if (email && !isValidEmail(email)) {
      errors.email = email.length > EMAIL_MAX ? `Email tối đa ${EMAIL_MAX} ký tự.` : "Email không hợp lệ.";
    }

    const phone = values.phone || null;
    if (phone && !PHONE_REGEX.test(phone)) errors.phone = PHONE_MESSAGE;

    let departmentId: string | null = null;
    let departmentName: string | null = null;
    if (values.departmentCode) {
      const code = codeFromOption(values.departmentCode);
      const d = departmentByCode.get(code);
      if (!d) errors.departmentCode = `Không có phòng ban mã “${code}” trong công ty ${company.code}.`;
      else if (!d.isActive) errors.departmentCode = `Phòng ban “${code}” đã bị ẩn.`;
      else {
        departmentId = d.id;
        departmentName = d.name;
      }
    }

    let positionId: string | null = null;
    if (values.positionCode) {
      const code = codeFromOption(values.positionCode);
      const p = positionByCode.get(code);
      if (!p) errors.positionCode = `Không có chức danh mã “${code}”.`;
      else if (!p.isActive) errors.positionCode = `Chức danh “${code}” đã bị ẩn.`;
      else positionId = p.id;
    }

    let hireDate: string | null = null;
    const date = cellDate(get("hireDate"));
    if ("error" in date) errors.hireDate = date.error;
    else if (date.value && !isValidHireDate(date.value)) errors.hireDate = "Ngày vào làm phải từ năm 1950 đến không quá 1 năm sau hôm nay.";
    else hireDate = date.value;

    let role: Role = "LEARNER";
    if (values.role) {
      const found = roleByNormalized.get(normalizeHeader(values.role));
      if (!found) errors.role = "Vai trò chỉ được: Học viên, Quản lý, Biên soạn nội dung.";
      else role = found;
    }

    return {
      rowNumber,
      values: { ...values, employeeCode: employeeCode || values.employeeCode },
      status: "error",
      errors,
      data: { employeeCode, fullName, email, phone, departmentId, departmentName, positionId, hireDate, role },
    };
  });

  // --- Bước 2: mã trùng trong file -> lỗi ở mọi dòng trùng ---
  const rowsByCode = new Map<string, number[]>();
  for (const row of rows) {
    if (row.errors.employeeCode || !row.data?.employeeCode) continue;
    const list = rowsByCode.get(row.data.employeeCode) ?? [];
    list.push(row.rowNumber);
    rowsByCode.set(row.data.employeeCode, list);
  }
  for (const row of rows) {
    const list = row.data && rowsByCode.get(row.data.employeeCode);
    if (list && list.length > 1) {
      const others = list.filter((n) => n !== row.rowNumber);
      row.errors.employeeCode = `Mã NV bị trùng trong file (trùng với dòng ${others.join(", ")}).`;
    }
  }

  // --- Bước 3: phân loại theo dữ liệu đang có ---
  const codes = [...rowsByCode.keys()];
  const existing = codes.length
    ? await prisma.user.findMany({
        where: { employeeCode: { in: codes } },
        select: {
          id: true,
          employeeCode: true,
          companyId: true,
          role: true,
          fullName: true,
          email: true,
          phone: true,
          departmentId: true,
          positionId: true,
          hireDate: true,
          company: { select: { code: true } },
        },
      })
    : [];
  const existingByCode = new Map(existing.map((u) => [u.employeeCode, u]));

  for (const row of rows) {
    const data = row.data!;
    const current = existingByCode.get(data.employeeCode);

    if (current && !row.errors.employeeCode) {
      if (current.companyId !== company.id) {
        row.errors.employeeCode = `Mã NV đã thuộc công ty ${current.company.code}.`;
      } else if (actor.role !== "GROUP_ADMIN" && current.role === "GROUP_ADMIN") {
        row.errors.employeeCode = "Không được sửa tài khoản Admin tập đoàn.";
      }
    }

    if (Object.keys(row.errors).length > 0) {
      row.status = "error";
      delete row.data;
      continue;
    }

    if (!current) {
      row.status = "create";
      continue;
    }

    // Cập nhật: ô trống ở cột tuỳ chọn = giữ nguyên; không đổi vai trò / trạng thái / mật khẩu
    const changes: NonNullable<AnalyzedRow["changes"]> = {};
    if (data.fullName !== current.fullName) changes.fullName = data.fullName;
    if (data.email && data.email !== current.email) changes.email = data.email;
    if (data.phone && data.phone !== current.phone) changes.phone = data.phone;
    if (data.departmentId && data.departmentId !== current.departmentId) changes.departmentId = data.departmentId;
    if (data.positionId && data.positionId !== current.positionId) changes.positionId = data.positionId;
    if (data.hireDate && data.hireDate !== fromDbDate(current.hireDate)) changes.hireDate = toDbDate(data.hireDate);

    row.existingId = current.id;
    row.changes = changes;
    row.orgChanged = "departmentId" in changes || "positionId" in changes;
    row.status = Object.keys(changes).length > 0 ? "update" : "unchanged";
  }

  const summary: ImportSummary = {
    total: rows.length,
    create: rows.filter((r) => r.status === "create").length,
    update: rows.filter((r) => r.status === "update").length,
    unchanged: rows.filter((r) => r.status === "unchanged").length,
    error: rows.filter((r) => r.status === "error").length,
    skippedExamples,
  };

  return { rows, summary, workbook, sheet, columnIndex };
}

function dateDisplay(cell: ReturnType<Worksheet["getCell"]> | undefined): string {
  const parsed = cellDate(cell);
  if ("value" in parsed && parsed.value) {
    const [y, m, d] = parsed.value.split("-");
    return `${d}/${m}/${y}`;
  }
  return cellText(cell);
}

/** Bỏ phần chỉ dùng ở server trước khi trả về trình duyệt. */
export function toPreviewRows(rows: AnalyzedRow[]): ImportPreviewRow[] {
  return rows.map(({ rowNumber, values, status, errors }) => ({ rowNumber, values, status, errors }));
}

// ---------------------------------------------------------------------------------------------
// File báo lỗi: file gốc + cột “Lỗi” cuối sheet, ô lỗi tô đỏ

export async function buildErrorReport(result: Extract<AnalyzeResult, { rows: AnalyzedRow[] }>): Promise<Workbook> {
  const { workbook, sheet, columnIndex, rows } = result;
  const errorCol = Math.max(sheet.actualColumnCount, sheet.getRow(1).cellCount) + 1;

  const headerCell = sheet.getCell(1, errorCol);
  headerCell.value = "Lỗi";
  headerCell.font = { bold: true, color: { argb: ERROR_TEXT } };
  headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ERROR_FILL } };
  sheet.getColumn(errorCol).width = 60;

  const headerOf = new Map(IMPORT_COLUMNS.map((c) => [c.key, c.header.replace("*", "")]));
  for (const row of rows) {
    const entries = Object.entries(row.errors) as [ImportColumnKey, string][];
    if (entries.length === 0) continue;
    for (const [key] of entries) {
      const c = columnIndex.get(key);
      if (!c) continue;
      const cell = sheet.getCell(row.rowNumber, c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ERROR_FILL } };
      cell.font = { ...(cell.font ?? {}), color: { argb: ERROR_TEXT } };
    }
    const cell = sheet.getCell(row.rowNumber, errorCol);
    cell.value = entries.map(([key, message]) => `${headerOf.get(key)}: ${message}`).join("\n");
    cell.alignment = { wrapText: true, vertical: "top" };
    cell.font = { color: { argb: ERROR_TEXT } };
  }
  return workbook;
}

// ---------------------------------------------------------------------------------------------
// Ghi dữ liệu

export type ImportedPassword = { employeeCode: string; fullName: string; departmentName: string | null; password: string };

export type CommitResult = {
  created: number;
  updated: number;
  passwords: ImportedPassword[];
  /** Lỗi giữa chừng (các lô trước đó đã được lưu) */
  error?: string;
  timings: { hashMs: number; writeMs: number };
};

/**
 * Ghi theo lô 100 dòng / transaction. Chỉ gọi sau khi analyzeImportFile không còn dòng lỗi.
 * Băm mật khẩu TRƯỚC khi mở transaction để transaction không phải chờ CPU.
 */
export async function commitImport(
  actor: CurrentUser,
  company: ImportCompany,
  rows: AnalyzedRow[],
  fileName: string,
): Promise<CommitResult> {
  const actionable = rows.filter((r) => r.status === "create" || r.status === "update");
  const passwords: ImportedPassword[] = [];
  const createdCodes: string[] = [];
  const updatedCodes: string[] = [];
  const timings = { hashMs: 0, writeMs: 0 };
  let error: string | undefined;

  for (let i = 0; i < actionable.length; i += BATCH_SIZE) {
    const batch = actionable.slice(i, i + BATCH_SIZE);
    const creates = batch.filter((r) => r.status === "create");
    const updates = batch.filter((r) => r.status === "update");

    // 1. Mật khẩu tạm cho người mới (ngoài transaction)
    const t0 = performance.now();
    const createData: Prisma.UserCreateManyInput[] = [];
    const batchPasswords: ImportedPassword[] = [];
    for (const row of creates) {
      const d = row.data!;
      const password = generateTempPassword();
      createData.push({
        employeeCode: d.employeeCode,
        fullName: d.fullName,
        email: d.email,
        phone: d.phone,
        companyId: company.id,
        departmentId: d.departmentId,
        positionId: d.positionId,
        hireDate: toDbDate(d.hireDate),
        role: d.role,
        status: "ACTIVE",
        passwordHash: await bcrypt.hash(password, IMPORT_BCRYPT_COST),
        mustChangePassword: true,
      });
      batchPasswords.push({ employeeCode: d.employeeCode, fullName: d.fullName, departmentName: d.departmentName, password });
    }
    timings.hashMs += performance.now() - t0;

    // 2. Ghi lô
    const t1 = performance.now();
    try {
      await prisma.$transaction(
        async (tx) => {
          if (createData.length > 0) await tx.user.createMany({ data: createData });
          for (const row of updates) {
            // Giới hạn trong công ty của file để chắc chắn không sửa nhầm người công ty khác
            const res = await tx.user.updateMany({ where: { id: row.existingId!, companyId: company.id }, data: row.changes! });
            if (res.count !== 1) throw new Error(`STALE:${row.rowNumber}`);
          }
        },
        { timeout: 30_000, maxWait: 10_000 },
      );
    } catch (e) {
      const first = batch[0].rowNumber;
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        error = `Có mã nhân viên vừa được tạo ở nơi khác trong lúc import (lô bắt đầu từ dòng ${first}). Hãy kiểm tra lại file.`;
      } else if (e instanceof Error && e.message.startsWith("STALE:")) {
        error = `Dữ liệu dòng ${e.message.slice(6)} đã thay đổi trong lúc import. Hãy kiểm tra lại file.`;
      } else {
        error = `Lỗi khi lưu lô bắt đầu từ dòng ${first}.`;
        console.error("Import nhân viên lỗi:", e);
      }
      timings.writeMs += performance.now() - t1;
      break;
    }
    timings.writeMs += performance.now() - t1;

    passwords.push(...batchPasswords);
    createdCodes.push(...creates.map((r) => r.data!.employeeCode));
    updatedCodes.push(...updates.map((r) => r.data!.employeeCode));

    // 3. Quy tắc giao khoá (Việc 18) cho người mới + người đổi phòng ban / chức danh
    const created = creates.length
      ? await prisma.user.findMany({
          where: { employeeCode: { in: creates.map((r) => r.data!.employeeCode) } },
          select: { id: true },
        })
      : [];
    for (const u of created) await onUserOrgChanged(u.id);
    for (const row of updates) if (row.orgChanged) await onUserOrgChanged(row.existingId!);
  }

  if (createdCodes.length > 0 || updatedCodes.length > 0) {
    // Không ghi mật khẩu vào nhật ký
    await logAudit(prisma, {
        actorId: actor.id,
        companyId: company.id,
        action: "USERS_IMPORTED",
        entityType: "User",
        entityId: null,
        metadata: {
          companyCode: company.code,
          fileName,
          created: createdCodes.length,
          updated: updatedCodes.length,
          createdCodes,
          updatedCodes,
          ...(error && { stoppedWithError: error }),
        },
      });
  }

  return { created: createdCodes.length, updated: updatedCodes.length, passwords, error, timings };
}

/** File danh sách mật khẩu tạm (chỉ tạo trong bộ nhớ, trả về 1 lần). */
export function buildPasswordWorkbook(company: ImportCompany, passwords: ImportedPassword[]): Workbook {
  const wb = createWorkbook();
  const ws = addSimpleSheet(
    wb,
    "Mật khẩu tạm",
    [
      { header: "Mã NV", width: 16, value: (p: ImportedPassword) => p.employeeCode },
      { header: "Họ tên", width: 28, value: (p) => p.fullName },
      { header: "Phòng ban", width: 30, value: (p) => p.departmentName ?? "" },
      { header: "Mật khẩu tạm", width: 18, value: (p) => p.password },
    ],
    passwords,
  );
  ws.getColumn(4).font = { name: "Consolas" };
  ws.addRow([]);
  const note = ws.addRow([
    `Công ty ${company.code}. File chứa mật khẩu: chỉ gửi riêng cho từng người, xoá sau khi phát. Người dùng phải đổi mật khẩu ở lần đăng nhập đầu.`,
  ]);
  ws.mergeCells(note.number, 1, note.number, 4);
  note.font = { italic: true, color: { argb: ERROR_TEXT } };
  return wb;
}
