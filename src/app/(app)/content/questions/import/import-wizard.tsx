"use client";

import { useRef, useState, useTransition } from "react";
import Link from "next/link";
import { CircleCheck, Download, FileSpreadsheet, FileWarning, RotateCcw, TriangleAlert, Upload } from "lucide-react";
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
import { downloadBase64 } from "@/lib/download";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { confirmQuestionImportAction, questionErrorReportAction, validateQuestionImportAction } from "./actions";
import { QuestionImportPreviewTable } from "./import-preview-table";
import {
  QUESTION_IMPORT_MAX_FILE_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
  type QuestionImportSummary,
  type QuestionPreviewRow,
} from "./types";

type Preview = { summary: QuestionImportSummary; rows: QuestionPreviewRow[] };

/**
 * 3 bước: chọn file → kiểm tra & xem trước → xác nhận & kết quả.
 * Trình duyệt giữ File trong bộ nhớ; mỗi bước gửi lại chính file để server kiểm tra lại từ đầu.
 */
export function QuestionImportWizard({ course }: { course: { id: string; label: string } }) {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [created, setCreated] = useState<number | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [checking, startChecking] = useTransition();
  const [importing, startImporting] = useTransition();
  const [reporting, startReporting] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const busy = checking || importing || reporting;
  const backHref = `/content/questions?course=${course.id}`;

  function formData() {
    const fd = new FormData();
    fd.set("courseId", course.id);
    if (file) fd.set("file", file);
    return fd;
  }

  function reset() {
    setPreview(null);
    setCreated(null);
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function pickFile(next: File | null) {
    setPreview(null);
    setCreated(null);
    setFile(next);
    // Báo sớm ở trình duyệt; server vẫn kiểm tra lại
    if (next && !/\.xlsx$/i.test(next.name)) setFileError("Chỉ nhận file Excel định dạng .xlsx.");
    else if (next && next.size > QUESTION_IMPORT_MAX_FILE_BYTES) setFileError("File vượt quá 5MB.");
    else setFileError(null);
  }

  function check() {
    if (!file || fileError) return;
    startChecking(async () => {
      try {
        const result = await validateQuestionImportAction(formData());
        if (!result.ok) {
          toast.error(result.message);
          setFileError(result.message);
          return;
        }
        setPreview({ summary: result.summary, rows: result.rows });
      } catch {
        toast.error("Không kiểm tra được file, vui lòng thử lại.");
      }
    });
  }

  function downloadErrorReport() {
    startReporting(async () => {
      try {
        const result = await questionErrorReportAction(formData());
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
        const result = await confirmQuestionImportAction(formData());
        setConfirmOpen(false);
        if (!result.ok) {
          toast.error(result.message);
          // Server kiểm tra lại thấy lỗi mới -> cập nhật bảng xem trước
          if (result.summary && result.rows) setPreview({ summary: result.summary, rows: result.rows });
          return;
        }
        toast.success(`Đã thêm ${formatNumber(result.created)} câu hỏi.`);
        setCreated(result.created);
        setPreview(null);
      } catch {
        setConfirmOpen(false);
        toast.error("Import không thành công, vui lòng thử lại.");
      }
    });
  }

  // ------------------------------------------------------------------ Bước 3: kết quả
  if (created !== null) {
    return (
      <section className="rounded-md bg-card p-6 shadow-md">
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-success/16 text-success">
            <CircleCheck className="size-8" />
          </div>
          <h2 className="text-lg font-medium text-foreground">Đã import xong</h2>
          <p className="text-[15px] text-muted-foreground">
            Đã thêm <strong className="font-medium text-foreground">{formatNumber(created)}</strong> câu hỏi vào{" "}
            {course.label}.
          </p>
        </div>
        <div className="flex justify-center gap-4">
          <Link href={backHref} className={buttonVariants({ variant: "outline" })}>
            Về ngân hàng câu hỏi
          </Link>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw />
            Import file khác
          </Button>
        </div>
      </section>
    );
  }

  const summary = preview?.summary;
  const importable = summary ? summary.valid + summary.warning : 0;
  const canImport = !!summary && summary.error === 0 && importable > 0;

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ Bước 1: chọn file */}
      <section className="rounded-md bg-card p-6 shadow-md">
        <h2 className="mb-4 text-lg font-medium text-foreground">1. Chọn file</h2>
        <FormGrid cols={2}>
          <FormField label="Khoá học" htmlFor="import-course" hint="Câu hỏi trong file được THÊM MỚI vào khoá này.">
            <Input id="import-course" value={course.label} readOnly className="bg-muted text-muted-foreground" />
          </FormField>

          <FormField
            label="File mẫu"
            htmlFor="template-link"
            hint="Cùng định dạng với file “Xuất Excel” — có thể xuất từ khoá khác, sửa rồi import."
          >
            <a
              id="template-link"
              href="/content/questions/template"
              download
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
            hint={`Tối đa 5MB, ${QUESTION_IMPORT_MAX_ROWS.toLocaleString("vi-VN")} câu. Không hỗ trợ ảnh — thêm ảnh sau trong trang.`}
            span="full"
          >
            <div className="flex items-center gap-4">
              <Input
                ref={fileInputRef}
                id="import-file"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={busy}
                onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                className="h-auto max-w-md py-1.5 file:mr-3 file:h-7 file:rounded-md file:bg-muted file:px-3"
                aria-invalid={!!fileError}
              />
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
                {file?.name} · {formatNumber(summary.total)} câu hỏi
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

          <div className="grid grid-cols-3 gap-6 px-6 pb-6">
            <Stat label="Hợp lệ" value={summary.valid} tone="success" />
            <Stat label="Cảnh báo (vẫn import được)" value={summary.warning} tone="warning" />
            <Stat label="Lỗi" value={summary.error} tone="destructive" />
          </div>

          {summary.error > 0 && (
            <p className="mx-6 mb-4 flex items-center gap-2 rounded-md bg-destructive/16 px-4 py-2.5 text-[13px] text-destructive">
              <TriangleAlert className="size-4 shrink-0" />
              Còn {formatNumber(summary.error)} dòng lỗi — sửa trong Excel rồi chọn lại file và bấm “Kiểm tra file”. Chỉ
              import được khi không còn dòng lỗi.
            </p>
          )}
          {summary.error === 0 && summary.warning > 0 && (
            <p className="mx-6 mb-4 flex items-center gap-2 rounded-md bg-warning/16 px-4 py-2.5 text-[13px] text-warning">
              <TriangleAlert className="size-4 shrink-0" />
              {formatNumber(summary.warning)} câu trùng nội dung với câu đã có — vẫn được thêm nếu bạn xác nhận. Xoá các dòng
              đó trong Excel nếu không muốn thêm trùng.
            </p>
          )}

          <QuestionImportPreviewTable key={`${file?.name}-${summary.total}-${summary.error}`} rows={preview.rows} />
        </section>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={(next) => !importing && setConfirmOpen(next)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận import?</AlertDialogTitle>
            <AlertDialogDescription>
              Sẽ thêm mới {formatNumber(importable)} câu hỏi vào {course.label}
              {summary && summary.warning > 0 ? ` (trong đó ${formatNumber(summary.warning)} câu trùng nội dung)` : ""}. Hệ
              thống kiểm tra lại toàn bộ file trước khi lưu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={importing}>Huỷ</AlertDialogCancel>
            <Button onClick={confirmImport} disabled={importing}>
              {importing ? "Đang import..." : "Import"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const STAT_TONES = {
  success: "border-l-success text-success",
  warning: "border-l-warning text-warning",
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
