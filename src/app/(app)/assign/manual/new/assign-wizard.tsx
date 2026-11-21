"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Check, Search, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssignCounts } from "@/lib/assignment";
import { addDaysIso, formatDate, formatNumber, vnIsoDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { assignManualAction, previewManualAction } from "./actions";
import { LearnerPicker } from "./learner-picker";
import type { DepartmentOption, DueChoice, Option, Selection, WizardCourse } from "./types";

const STEPS = ["Chọn khoá", "Cách giao", "Chọn người", "Đặt hạn"] as const;

/** Trình giao khoá 4 bước. Mọi kiểm tra quyền / phạm vi làm lại ở server khi xem trước và khi giao. */
export function AssignWizard({
  courses,
  initialCourseId,
  companies,
  departments,
  positions,
  defaultDays,
}: {
  courses: WizardCourse[];
  initialCourseId: string | null;
  companies: Option[];
  departments: DepartmentOption[];
  positions: Option[];
  defaultDays: number;
}) {
  const router = useRouter();
  const [step, setStep] = useState(initialCourseId ? 1 : 0);
  const [courseId, setCourseId] = useState<string | null>(initialCourseId);
  const [selection, setSelection] = useState<Selection>({ mode: "ids", ids: [] });
  const [due, setDue] = useState<DueChoice>({ mode: "days", days: defaultDays });
  const course = courses.find((c) => c.id === courseId) ?? null;

  const hasSelection = selection.mode === "filter" || selection.ids.length > 0;

  return (
    <section className="rounded-md bg-card shadow-md">
      {/* Thanh bước */}
      <ol className="flex border-b border-border px-6" aria-label="Các bước giao khoá">
        {STEPS.map((label, i) => (
          <li
            key={label}
            aria-current={i === step ? "step" : undefined}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-[15px]",
              i === step ? "border-primary font-medium text-primary" : i < step ? "border-transparent text-foreground" : "border-transparent text-muted-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[13px]",
                i < step ? "bg-success/16 text-success" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
              )}
            >
              {i < step ? <Check className="size-3.5" /> : i + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>

      <div className="p-6">
        {step === 0 && (
          <CourseStep
            courses={courses}
            selectedId={courseId}
            onSelect={(id) => {
              setCourseId(id);
              setSelection({ mode: "ids", ids: [] });
              setStep(1);
            }}
          />
        )}

        {step === 1 && course && (
          <div className="grid gap-4">
            <CourseSummary course={course} />
            <div role="radiogroup" aria-label="Cách giao" className="grid grid-cols-2 gap-4">
              <ChoiceCard
                icon={<UserCheck className="size-6" />}
                title="Thủ công — chọn từng người"
                hint="Chọn đúng những người cần học ngay bây giờ. Người vào sau không tự được giao."
                onClick={() => setStep(2)}
              />
              <Link
                href={`/assign/rules/new?courseId=${course.id}`}
                className="flex items-start gap-4 rounded-md border border-border p-5 text-left transition-colors outline-none hover:border-primary hover:bg-primary/8 focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-info/16 text-info">
                  <Users className="size-6" />
                </span>
                <span>
                  <span className="block text-lg font-medium text-foreground">Tự động — theo nhóm, gồm cả người vào sau</span>
                  <span className="block text-[15px] text-muted-foreground">
                    Tạo quy tắc theo công ty / phòng ban / chức danh. Người mới vào nhóm sau này cũng tự được giao.
                  </span>
                </span>
              </Link>
            </div>
          </div>
        )}

        {step === 2 && course && (
          <div className="grid gap-4">
            <CourseSummary course={course} />
            <LearnerPicker
              course={course}
              companies={companies}
              departments={departments}
              positions={positions}
              selection={selection}
              onChange={setSelection}
            />
          </div>
        )}

        {step === 3 && course && (
          <DueStep
            course={course}
            selection={selection}
            due={due}
            defaultDays={defaultDays}
            onDueChange={setDue}
            onDone={() => router.push("/assign/manual")}
          />
        )}
      </div>

      {/* Điều hướng */}
      <div className="flex items-center justify-between gap-4 border-t border-border px-6 py-4">
        {step > 0 ? (
          <Button type="button" variant="outline" onClick={() => setStep(step - 1)}>
            <ArrowLeft />
            Quay lại
          </Button>
        ) : (
          <Link href="/assign/manual" className={buttonVariants({ variant: "outline" })}>
            Huỷ
          </Link>
        )}
        {step === 2 && (
          <Button type="button" disabled={!hasSelection} onClick={() => setStep(3)}>
            Tiếp: đặt hạn
            <ArrowRight />
          </Button>
        )}
      </div>
    </section>
  );
}

function CourseSummary({ course }: { course: WizardCourse }) {
  return (
    <p className="flex items-center gap-2 rounded-md bg-primary/8 px-4 py-2.5 text-[15px] text-foreground">
      <BookOpen className="size-4 text-primary" />
      <span className="font-medium">{course.title}</span>
      <span className="text-muted-foreground">
        · {course.code} · công ty {course.ownerCode}
      </span>
    </p>
  );
}

function ChoiceCard({ icon, title, hint, onClick }: { icon: React.ReactNode; title: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={false}
      onClick={onClick}
      className="flex items-start gap-4 rounded-md border border-border p-5 text-left transition-colors outline-none hover:border-primary hover:bg-primary/8 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-primary/16 text-primary">{icon}</span>
      <span>
        <span className="block text-lg font-medium text-foreground">{title}</span>
        <span className="block text-[15px] text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

function CourseStep({
  courses,
  selectedId,
  onSelect,
}: {
  courses: WizardCourse[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? courses.filter((c) => `${c.code} ${c.title}`.toLowerCase().includes(needle)) : courses;
  }, [courses, q]);

  if (courses.length === 0) {
    return (
      <p className="py-10 text-center text-muted-foreground">
        Chưa có khoá học nào đã phát hành trong phạm vi của bạn. Khoá phải được phát hành trước khi giao.
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm khoá học theo tên, mã..." aria-label="Tìm khoá học" className="pl-9" autoFocus />
      </div>
      <ul className="grid max-h-[50vh] gap-2 overflow-y-auto">
        {list.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={cn(
                "flex w-full items-center justify-between gap-4 rounded-md border px-4 py-3 text-left transition-colors outline-none hover:border-primary hover:bg-primary/8 focus-visible:ring-3 focus-visible:ring-ring/50",
                c.id === selectedId ? "border-primary bg-primary/8" : "border-border",
              )}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{c.title}</span>
                <span className="text-[13px] text-muted-foreground">{c.code}</span>
              </span>
              <span className="shrink-0 text-[13px] text-muted-foreground">Công ty {c.ownerCode}</span>
            </button>
          </li>
        ))}
        {list.length === 0 && <li className="py-6 text-center text-muted-foreground">Không tìm thấy khoá học.</li>}
      </ul>
    </div>
  );
}

const COUNT_ROWS: { key: keyof AssignCounts; label: string; tone: string }[] = [
  { key: "created", label: "Giao mới", tone: "text-success" },
  { key: "reactivated", label: "Kích hoạt lại (đã huỷ trước đó)", tone: "text-success" },
  { key: "shortened", label: "Đã có — rút ngắn hạn", tone: "text-info" },
  { key: "unchanged", label: "Đã có — giữ nguyên", tone: "text-muted-foreground" },
  { key: "completed", label: "Đã hoàn thành — bỏ qua", tone: "text-muted-foreground" },
  { key: "skipped", label: "Bỏ qua (tài khoản khoá / công ty tạm ngưng)", tone: "text-warning" },
];

function DueStep({
  course,
  selection,
  due,
  defaultDays,
  onDueChange,
  onDone,
}: {
  course: WizardCourse;
  selection: Selection;
  due: DueChoice;
  defaultDays: number;
  onDueChange: (due: DueChoice) => void;
  onDone: () => void;
}) {
  const [preview, setPreview] = useState<{ counts: AssignCounts; selected: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [saving, startSaving] = useTransition();

  // Xem trước lại mỗi khi đổi hạn (chờ người dùng nhập xong)
  useEffect(() => {
    const t = setTimeout(() => {
      startLoading(async () => {
        try {
          const r = await previewManualAction(course.id, selection, due);
          if (r.ok) {
            setPreview({ counts: r.counts, selected: r.selected });
            setError(null);
          } else {
            setPreview(null);
            setError(r.message);
          }
        } catch {
          setError("Không xem trước được, vui lòng thử lại.");
        }
      });
    }, 300);
    return () => clearTimeout(t);
  }, [course.id, selection, due]);

  const dueText =
    due.mode === "days" ? formatDate(`${addDaysIso(vnIsoDate(), due.days)}T12:00:00+07:00`) : due.date ? formatDate(`${due.date}T12:00:00+07:00`) : "—";
  const willChange = preview ? preview.counts.created + preview.counts.reactivated + preview.counts.shortened : 0;

  function confirm() {
    startSaving(async () => {
      try {
        const r = await assignManualAction(course.id, selection, due);
        if (!r.ok) return void toast.error(r.message);
        toast.success(`Đã giao “${course.title}”: ${r.counts.created + r.counts.reactivated} người mới, rút ngắn hạn ${r.counts.shortened} người.`);
        onDone();
      } catch {
        toast.error("Giao khoá không thành công, vui lòng thử lại.");
      }
    });
  }

  return (
    <div className="grid gap-6">
      <CourseSummary course={course} />
      <div className="grid grid-cols-2 gap-6">
        <div className="grid content-start gap-4">
          <p className="font-medium text-foreground">Hạn hoàn thành</p>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="due-mode"
              className="size-4 accent-primary"
              checked={due.mode === "days"}
              onChange={() => onDueChange({ mode: "days", days: due.mode === "days" ? due.days : defaultDays })}
            />
            <span className="text-[15px]">Sau</span>
            <Input
              type="number"
              min={1}
              max={365}
              className="w-24"
              aria-label="Số ngày"
              disabled={due.mode !== "days"}
              value={due.mode === "days" ? due.days : defaultDays}
              onChange={(e) => onDueChange({ mode: "days", days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })}
            />
            <span className="text-[15px]">ngày</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="radio"
              name="due-mode"
              className="size-4 accent-primary"
              checked={due.mode === "date"}
              onChange={() => onDueChange({ mode: "date", date: addDaysIso(vnIsoDate(), defaultDays) })}
            />
            <span className="text-[15px]">Đến ngày</span>
            <Input
              type="date"
              className="w-44"
              aria-label="Ngày hạn"
              disabled={due.mode !== "date"}
              min={addDaysIso(vnIsoDate(), 1)}
              value={due.mode === "date" ? due.date : ""}
              onChange={(e) => onDueChange({ mode: "date", date: e.target.value })}
            />
          </label>
          <p className="text-[13px] text-muted-foreground">Hạn: hết ngày {dueText} (giờ Việt Nam).</p>
        </div>

        <div className="rounded-md border border-border p-4" aria-live="polite">
          <p className="mb-3 font-medium text-foreground">
            Xem trước {preview && <span className="font-normal text-muted-foreground">· {formatNumber(preview.selected)} người được chọn</span>}
          </p>
          {error ? (
            <p className="text-[15px] text-destructive">{error}</p>
          ) : !preview ? (
            <p className="text-[15px] text-muted-foreground">Đang tính...</p>
          ) : (
            <dl className={cn("grid gap-1.5 text-[15px]", loading && "opacity-60")}>
              {COUNT_ROWS.filter((r) => r.key === "created" || preview.counts[r.key] > 0).map((r) => (
                <div key={r.key} className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">{r.label}</dt>
                  <dd className={cn("font-medium tabular-nums", r.tone)}>{formatNumber(preview.counts[r.key])}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={confirm} disabled={saving || loading || !preview || willChange === 0}>
          {saving ? "Đang giao..." : `Xác nhận giao (${formatNumber(willChange)} thay đổi)`}
        </Button>
      </div>
    </div>
  );
}
