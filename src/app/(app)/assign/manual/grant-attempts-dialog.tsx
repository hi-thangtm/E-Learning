"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getQuizGrantOptionsAction, grantQuizAttemptsAction, type QuizGrantOption } from "./actions";

function attemptsText(o: QuizGrantOption): string {
  if (o.maxAttempts === null) return `đã làm ${o.used} lần · không giới hạn`;
  const bonus = o.bonusAttempts > 0 ? ` (+${o.bonusAttempts} đã cấp)` : "";
  return `đã làm ${o.used}/${o.maxAttempts + o.bonusAttempts} lần${bonus}`;
}

/** “Cấp thêm lượt làm bài”: chọn bài kiểm tra của khoá, nhập số lượt 1–5 → cộng vào bonusAttempts. */
export function GrantAttemptsDialog({
  enrollment,
  onClose,
}: {
  enrollment: { id: string; learner: string; course: string };
  onClose: () => void;
}) {
  const [options, setOptions] = useState<QuizGrantOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lessonId, setLessonId] = useState<string>("");
  const [count, setCount] = useState("1");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  // Tải danh sách bài kiểm tra khi mở dialog
  useEffect(() => {
    let cancelled = false;
    getQuizGrantOptionsAction(enrollment.id)
      .then((r) => {
        if (cancelled) return;
        if (!r.ok) {
          setLoadError(r.message);
          return;
        }
        setOptions(r.options);
        const first = r.options.find((o) => o.maxAttempts !== null && !o.passed) ?? r.options.find((o) => o.maxAttempts !== null);
        if (first) setLessonId(first.lessonId);
      })
      .catch(() => !cancelled && setLoadError("Không tải được danh sách bài kiểm tra."));
    return () => {
      cancelled = true;
    };
  }, [enrollment.id]);

  const selected = options?.find((o) => o.lessonId === lessonId);
  const items = (options ?? []).map((o) => ({ value: o.lessonId, label: o.title }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        const r = await grantQuizAttemptsAction(enrollment.id, lessonId, Number(count));
        if (r.ok) {
          toast.success(r.message ?? "Đã cấp thêm lượt.");
          onClose();
        } else {
          setErrors(r.errors ?? {});
          if (r.message) toast.error(r.message);
        }
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cấp thêm lượt làm bài</DialogTitle>
          <DialogDescription>
            {enrollment.learner} — {enrollment.course}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="contents">
          <DialogBody>
            {loadError ? (
              <p className="rounded-md bg-destructive/16 px-4 py-3 text-[15px] text-destructive">{loadError}</p>
            ) : options === null ? (
              <p className="flex items-center gap-2 py-6 text-[15px] text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Đang tải bài kiểm tra…
              </p>
            ) : options.length === 0 ? (
              <p className="rounded-md bg-muted px-4 py-3 text-[15px] text-muted-foreground">Khoá học này không có bài kiểm tra.</p>
            ) : (
              <FormGrid>
                <FormField
                  label="Bài kiểm tra"
                  htmlFor="grant-lesson"
                  required
                  error={errors.lessonId}
                  hint={
                    selected
                      ? `${attemptsText(selected)} · điểm cao nhất ${selected.bestScore ?? "—"}${selected.passed ? " · đã đạt" : ""}`
                      : undefined
                  }
                >
                  <Select items={items} value={lessonId || null} onValueChange={(v) => setLessonId(v ? String(v) : "")}>
                    <SelectTrigger id="grant-lesson" className="w-full" aria-invalid={!!errors.lessonId}>
                      <SelectValue placeholder="Chọn bài kiểm tra" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.map((o) => (
                        <SelectItem key={o.lessonId} value={o.lessonId} disabled={o.maxAttempts === null}>
                          <span className="min-w-0">
                            <span className="block truncate">{o.title}</span>
                            <span className="block text-[13px] text-muted-foreground">
                              {attemptsText(o)} · điểm cao nhất {o.bestScore ?? "—"}
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Số lượt cấp thêm" htmlFor="grant-count" required error={errors.count} hint="Từ 1 đến 5 lượt.">
                  <Input
                    id="grant-count"
                    type="number"
                    min={1}
                    max={5}
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    className="w-32"
                    aria-invalid={!!errors.count}
                  />
                </FormField>
              </FormGrid>
            )}
          </DialogBody>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
            <Button type="submit" disabled={pending || !lessonId || !selected || selected.maxAttempts === null}>
              {pending ? "Đang lưu..." : "Cấp thêm lượt"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
