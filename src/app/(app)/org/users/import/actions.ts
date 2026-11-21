"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/current-user";
import { workbookToBase64 } from "@/lib/excel";
import {
  analyzeImportFile,
  buildErrorReport,
  buildPasswordWorkbook,
  commitImport,
  resolveImportCompany,
  toPreviewRows,
} from "./import-service";
import type { ConfirmImportResult, ErrorReportResult, ValidateImportResult } from "./types";

/**
 * Import nhân viên từ Excel — Admin tập đoàn (chọn công ty) và Admin công ty (công ty mình).
 * Mỗi action nhận lại chính file và kiểm tra lại toàn bộ ở server (không tin kết quả xem trước từ trình duyệt).
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN"] as const;

async function readInput(formData: FormData) {
  const actor = await requireRole([...ROLES]);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false as const, error: "Vui lòng chọn file Excel." };

  const company = await resolveImportCompany(actor, String(formData.get("companyId") ?? ""));
  if ("error" in company) return { ok: false as const, error: company.error };

  // Kiểm tra đuôi / dung lượng TRƯỚC khi đọc nội dung
  const analyzed = await analyzeImportFile(actor, company, {
    name: file.name,
    size: file.size,
    buffer: file.size <= 6 * 1024 * 1024 ? await file.arrayBuffer() : new ArrayBuffer(0),
  });
  return { ok: true as const, actor, company, file, analyzed };
}

/** Bước 2: kiểm tra file, không ghi gì. */
export async function validateImportAction(formData: FormData): Promise<ValidateImportResult> {
  const input = await readInput(formData);
  if (!input.ok) return { ok: false, message: input.error };
  if ("fileError" in input.analyzed) return { ok: false, message: input.analyzed.fileError };

  return {
    ok: true,
    companyCode: input.company.code,
    summary: input.analyzed.summary,
    rows: toPreviewRows(input.analyzed.rows),
  };
}

/** File gốc + cột “Lỗi” (ô lỗi tô đỏ). */
export async function errorReportAction(formData: FormData): Promise<ErrorReportResult> {
  const input = await readInput(formData);
  if (!input.ok) return { ok: false, message: input.error };
  if ("fileError" in input.analyzed) return { ok: false, message: input.analyzed.fileError };

  const wb = await buildErrorReport(input.analyzed);
  const base = input.file.name.replace(/\.xlsx$/i, "");
  return { ok: true, file: await workbookToBase64(wb), fileName: `${base}-bao-loi.xlsx` };
}

/** Bước 3: kiểm tra lại toàn bộ rồi ghi theo lô. Chỉ ghi khi KHÔNG còn dòng lỗi. */
export async function confirmImportAction(formData: FormData): Promise<ConfirmImportResult> {
  const input = await readInput(formData);
  if (!input.ok) return { ok: false, message: input.error };
  if ("fileError" in input.analyzed) return { ok: false, message: input.analyzed.fileError };

  const { actor, company, file, analyzed } = input;
  if (analyzed.summary.error > 0) {
    return {
      ok: false,
      message: `File còn ${analyzed.summary.error} dòng lỗi, chưa import. Hãy sửa rồi kiểm tra lại.`,
      summary: analyzed.summary,
      rows: toPreviewRows(analyzed.rows),
    };
  }
  if (analyzed.summary.create + analyzed.summary.update === 0) {
    return { ok: false, message: "Không có dòng nào cần tạo mới hoặc cập nhật." };
  }

  const result = await commitImport(actor, company, analyzed.rows, file.name);

  revalidatePath("/org/users");
  revalidatePath("/org/departments");
  revalidatePath("/system/companies");

  if (result.created === 0 && result.updated === 0) {
    return { ok: false, message: result.error ?? "Không lưu được dữ liệu." };
  }

  const passwordFile =
    result.passwords.length > 0 ? await workbookToBase64(buildPasswordWorkbook(company, result.passwords)) : null;

  return {
    ok: true,
    created: result.created,
    updated: result.updated,
    warning: result.error,
    passwordFile,
    passwordFileName: `mat-khau-tam-${company.code}-${new Date().toISOString().slice(0, 10)}.xlsx`,
  };
}
