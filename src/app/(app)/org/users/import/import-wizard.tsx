"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import {
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileWarning,
  KeyRound,
  RotateCcw,
  TriangleAlert,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { downloadBase64 } from "@/lib/download";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirmImportAction, errorReportAction, validateImportAction } from "./actions";
import { ImportPreviewTable } from "./import-preview-table";
import { IMPORT_MAX_FILE_BYTES, type ImportPreviewRow, type ImportSummary } from "./types";
import { FilePicker } from "@/components/file-picker";

type Preview = { companyCode: string; summary: ImportSummary; rows: ImportPreviewRow[] };
type Done = { created: number; updated: number; warning?: string; passwordFile: string | null; passwordFileName: string };

/**
 * 3 bước: chọn công ty + file → kiểm tra & xem trước → xác nhận & kết quả.
 * Trình duyệt giữ File trong bộ nhớ; mỗi bước gửi lại chính file để server kiểm tra lại từ đầu.
 */
export function ImportWizard({
  isGroupAdmin,
  companies,
  defaultCompanyId,
}: {
  isGroupAdmin: boolean;
  companies: { id: string; label: string }[];
  defaultCompanyId: string;
}) {
  const [companyId, setCompanyId] = useState(defaultCompanyId);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<Done | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checking, startChecking] = useTransition();
  const [importing, startImporting] = useTransition();
  const [reporting, startReporting] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const company = companies.find((c) => c.id === companyId);
  const busy = checking || importing || reporting;

  function formData() {
    const fd = new FormData();
    fd.set("companyId", companyId);
    if (file) fd.set("file", file);
    return fd;
  }

  function reset(clearFile: boolean) {
    setPreview(null);
    setDone(null);
    if (clearFile) {
      setFile(null);
      setFileError(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function pickFile(next: File | null) {
    reset(false);
    setFile(next);
    // Báo sớm ở trình duyệt; server vẫn kiểm tra lại
    if (next && !/\.xlsx$/i.test(next.name)) setFileError("Chỉ nhận file Excel định dạng .xlsx.");
    else if (next && next.size > IMPORT_MAX_FILE_BYTES) setFileError("File vượt quá 5MB.");
    else setFileError(null);
  }

  function check() {
    if (!file || fileError) return;
    startChecking(async () => {
      try {
        const result = await validateImportAction(formData());
        if (!result.ok) {
          toast.error(result.message);
          setFileError(result.message);
          return;
        }
        setPreview({ companyCode: result.companyCode, summary: result.summary, rows: result.rows });
      } catch {
        toast.error("Không kiểm tra được file, vui lòng thử lại.");
      }
    });
  }

  function downloadErrorReport() {
    startReporting(async () => {
      try {
        const result = await errorReportAction(formData());
        if (!result.ok) toast.error(result.message);
        else downloadBase64(result.file, result.fileName);
      } catch {
        toast.error("Không tạo được file báo lỗi, vui lòng thử lại.");
      }
    });
  }

  function confirmImport() {
    startImporting(async () => {
      try {
        const result = await confirmImportAction(formData());
        setConfirmOpen(false);
        if (!result.ok) {
          toast.error(result.message);
          // Server kiểm tra lại thấy lỗi mới -> cập nhật bảng xem trước
          if (result.summary && result.rows && preview) {
            setPreview({ ...preview, summary: result.summary, rows: result.rows });
          }
          return;
        }
        toast.success(`Đã import: ${result.created} tạo mới, ${result.updated} cập nhật.`);
        setDone(result);
        setPreview(null);
      } catch {
        setConfirmOpen(false);
        toast.error("Import không thành công, vui lòng thử lại.");
      }
    });
  }

  // ------------------------------------------------------------------ Bước 3: kết quả
  if (done) {
    return (
      <section className="rounded-md bg-card p-6 shadow-md">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-success/16 text-success">
            <CircleCheck className="size-8" />
          </div>
          <h2 className="text-lg font-medium text-foreground">Đã import xong</h2>
          <p className="text-[15px] text-muted-foreground">
            Tạo mới <strong className="font-medium text-foreground">{formatNumber(done.created)}</strong> người, cập nhật{" "}
            <strong className="font-medium text-foreground">{formatNumber(done.updated)}</strong> người
            {company ? ` cho ${company.label}` : ""}.
          </p>
        </div>

        {done.warning && (
          <p className="mb-4 flex items-start gap-2 rounded-md bg-destructive/16 px-4 py-3 text-[15px] text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            {done.warning} Các dòng trước đó đã được lưu.
          </p>
        )}

        {done.passwordFile && (
          <div className="mb-6 space-y-4 rounded-md border border-warning/40 bg-warning/8 p-4">
            <p className="flex items-start gap-2 text-[15px] text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <span>
                <strong className="font-medium">File chứa mật khẩu, chỉ gửi riêng cho từng người, xoá sau khi phát.</strong>{" "}
                Danh sách này chỉ tải được ngay lúc này — rời trang là mất, hệ thống không lưu mật khẩu ở đâu khác.
              </span>
            </p>
            <Button onClick={() => downloadBase64(done.passwordFile!, done.passwordFileName)}>
              <KeyRound />
              Tải danh sách mật khẩu tạm
            </Button>
          </div>
        )}

        <div className="flex justify-center gap-4">
          <Link href="/org/users" className={buttonVariants({ variant: "outline" })}>
            Về danh sách người dùng
          </Link>
          <Button variant="outline" onClick={() => reset(true)}>
            <RotateCcw />
            Import file khác
          </Button>
        </div>
      </section>
    );
  }

  const summary = preview?.summary;
  const canImport = !!summary && summary.error === 0 && summary.create + summary.update > 0;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ Bước 1: chọn file */}
      <section className="rounded-md bg-card p-6 shadow-md">
        <h2 className="mb-4 text-lg font-medium text-foreground">1. Chọn công ty và file</h2>
        <FormGrid cols={2}>
          <FormField label="Công ty" htmlFor="import-company" required hint="Mỗi file chỉ import cho 1 công ty.">
            {isGroupAdmin ? (
              <Select
                items={companies.map((c) => ({ value: c.id, label: c.label }))}
                value={companyId}
                disabled={busy}
                onValueChange={(v) => {
                  if (v && v !== companyId) {
                    setCompanyId(String(v));
                    reset(false);
                  }
                }}
              >
                <SelectTrigger id="import-company" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input id="import-company" value={company?.label ?? ""} readOnly className="bg-muted text-muted-foreground" />
            )}
          </FormField>

          <FormField label="File mẫu" htmlFor="template-link" hint="Danh sách phòng ban trong file mẫu theo công ty đã chọn.">
            <a
              id="template-link"
              href={`/org/users/import/template?company=${encodeURIComponent(companyId)}`}
              className={cn(buttonVariants({ variant: "outline" }), "w-fit")}
            >
              <Download />
              Tải file mẫu
            </a>
          </FormField>

          <FormField
            label="File Excel (.xlsx)"
            htmlFor="import-file"
            required
            error={fileError ?? undefined}
            hint="Tối đa 5MB, 2.000 dòng."
            span="full"
          >
            <div className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 max-w-md flex-1">
                <FilePicker
                  ref={fileInputRef}
                  id="import-file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  file={file}
                  disabled={busy}
                  onChange={pickFile}
                  invalid={!!fileError}
                />
              </div>
              <Button onClick={check} disabled={!file || !!fileError || busy}>
                <Upload />
                {checking ? "Đang kiểm tra..." : "Kiểm tra file"}
              </Button>
            </div>
          </FormField>
        </FormGrid>
      </section>

      {/* ------------------------------------------------------------ Bước 2: xem trước */}
      {preview && summary && (
        <section className="rounded-md bg-card shadow-md">
          <div className="flex items-start justify-between gap-4 p-6 pb-4">
            <div>
              <h2 className="text-lg font-medium text-foreground">2. Kết quả kiểm tra</h2>
              <p className="text-[15px] text-muted-foreground">
                {file?.name} · công ty {preview.companyCode} · {formatNumber(summary.total)} dòng dữ liệu
                {summary.skippedExamples > 0 && ` · đã bỏ qua ${summary.skippedExamples} dòng ví dụ`}
              </p>
            </div>
            <div className="flex shrink-0 gap-4">
              {summary.error > 0 && (
                <Button variant="outline" onClick={downloadErrorReport} disabled={busy}>
                  <FileWarning />
                  {reporting ? "Đang tạo file..." : "Tải file báo lỗi"}
                </Button>
              )}
              <Button onClick={() => setConfirmOpen(true)} disabled={!canImport || busy}>
                <FileSpreadsheet />
                Xác nhận import
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-6 px-6 pb-6">
            <Stat label="Tạo mới" value={summary.create} tone="success" />
            <Stat label="Cập nhật" value={summary.update} tone="info" />
            <Stat label="Không thay đổi" value={summary.unchanged} tone="secondary" />
            <Stat label="Lỗi" value={summary.error} tone="destructive" />
          </div>

          {summary.error > 0 ? (
            <p className="mx-6 mb-4 flex items-center gap-2 rounded-md bg-destructive/16 px-4 py-2.5 text-[13px] text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              Còn {formatNumber(summary.error)} dòng lỗi — sửa trong Excel rồi chọn lại file và bấm “Kiểm tra file”. Chỉ
              import được khi không còn dòng lỗi.
            </p>
          ) : (
            !canImport && (
              <p className="mx-6 mb-4 rounded-md bg-muted px-4 py-2.5 text-[13px] text-muted-foreground">
                Không có dòng nào cần tạo mới hoặc cập nhật.
              </p>
            )
          )}

          <ImportPreviewTable key={`${file?.name}-${summary.total}-${summary.error}`} rows={preview.rows} />
        </section>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !importing && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận import?</AlertDialogTitle>
            <AlertDialogDescription>
              Sẽ tạo mới {formatNumber(summary?.create ?? 0)} người và cập nhật {formatNumber(summary?.update ?? 0)} người
              cho {company?.label}. Người mới nhận mật khẩu tạm và phải đổi khi đăng nhập lần đầu. Hệ thống kiểm tra lại
              toàn bộ file trước khi lưu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Huỷ</AlertDialogCancel>
            <Button onClick={confirmImport} disabled={importing}>
              {importing ? "Đang import..." : `Import ${formatNumber((summary?.create ?? 0) + (summary?.update ?? 0))} người`}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const STAT_TONES = {
  success: "border-l-success text-success",
  info: "border-l-info text-info",
  secondary: "border-l-secondary-foreground text-secondary-foreground",
  destructive: "border-l-destructive text-destructive",
} as const;

/** Ô số liệu (thẻ số liệu thu gọn — docs/design-system.md mục 5.1). */
function Stat({ label, value, tone }: { label: string; value: number; tone: keyof typeof STAT_TONES }) {
  return (
    <div className={cn("rounded-md border border-l-4 border-border p-4", STAT_TONES[tone])}>
      <p className="text-[15px] text-foreground">{label}</p>
      <p className="text-2xl font-medium">{formatNumber(value)}</p>
    </div>
  );
}
