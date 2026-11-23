"use client";

import { useActionState, useCallback, useEffect, useId, useState, type ReactElement } from "react";
import type { QuestionType } from "@prisma/client";
import { ImagePlus, Plus, Trash2, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";
import { FormField, FormGrid } from "@/components/form-field";
import { SegmentedControl } from "@/components/segmented-control";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { initialActionState } from "@/lib/action-state";
import { fileUrl } from "@/lib/file-url";
import {
  OPTION_LETTERS,
  QUESTION_LIMITS,
  QUESTION_TYPE_LABELS,
  type QuestionOption,
} from "@/lib/question-labels";
import { cn } from "@/lib/utils";
import { createQuestionAction, updateQuestionAction } from "./actions";
import { Tooltip } from "@/components/ui/tooltip";

export type QuestionFormValue = {
  id: string;
  content: string;
  topic: string;
  type: QuestionType;
  imageKey: string | null;
  options: QuestionOption[];
  explanation: string;
};

type OptionRow = { key: string; id?: string; text: string; isCorrect: boolean };

let rowSeq = 0;
const nextKey = () => `row-${++rowSeq}`;

const IMAGE_MAX_BYTES = 2 * 1024 * 1024;

/** Dialog thêm / sửa câu hỏi. Không truyền `question` = thêm mới vào khoá `courseId`. */
export function QuestionFormDialog({
  trigger,
  courseId,
  question,
  topics,
}: {
  trigger: ReactElement;
  courseId: string;
  question?: QuestionFormValue;
  /** Các chủ đề đang có trong ngân hàng của khoá (gợi ý khi gõ) */
  topics: string[];
}) {
  const [open, setOpen] = useState(false);
  // Mỗi lần mở dialog tạo form mới -> xoá lỗi / dữ liệu cũ
  const [formKey, setFormKey] = useState(0);
  const close = useCallback(() => setOpen(false), []);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setFormKey((k) => k + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{question ? "Sửa câu hỏi" : "Thêm câu hỏi"}</DialogTitle>
          <DialogDescription>
            Câu hỏi được rút ngẫu nhiên vào các bài kiểm tra của khoá theo chủ đề.
          </DialogDescription>
        </DialogHeader>
        <QuestionForm key={formKey} courseId={courseId} question={question} topics={topics} onSuccess={close} />
      </DialogContent>
    </Dialog>
  );
}

function QuestionForm({
  courseId,
  question,
  topics,
  onSuccess,
}: {
  courseId: string;
  question?: QuestionFormValue;
  topics: string[];
  onSuccess: () => void;
}) {
  const [state, formAction, pending] = useActionState(
    question ? updateQuestionAction : createQuestionAction,
    initialActionState,
  );
  const uid = useId();
  const topicListId = `${uid}-topics`;

  useEffect(() => {
    if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess();
    } else if (state.message) {
      toast.error(state.message);
    }
  }, [state, onSuccess]);

  // --- Loại + phương án (state riêng, không bị reset khi form gửi lỗi) ---
  const [type, setType] = useState<QuestionType>(question?.type ?? "SINGLE");
  const [rows, setRows] = useState<OptionRow[]>(() =>
    question && question.options.length > 0
      ? question.options.map((o) => ({ key: nextKey(), id: o.id, text: o.text, isCorrect: o.isCorrect }))
      : [0, 1, 2, 3].map(() => ({ key: nextKey(), text: "", isCorrect: false })),
  );
  const [reselect, setReselect] = useState(false);

  function changeType(next: QuestionType) {
    if (next === type) return;
    // Nhiều -> Một mà đang có >1 đáp án đúng: bỏ chọn hết, bắt chọn lại
    if (next === "SINGLE" && rows.filter((r) => r.isCorrect).length > 1) {
      setRows((prev) => prev.map((r) => ({ ...r, isCorrect: false })));
      setReselect(true);
    }
    setType(next);
  }

  function markCorrect(key: string, checked: boolean) {
    setReselect(false);
    setRows((prev) =>
      prev.map((r) =>
        type === "SINGLE" ? { ...r, isCorrect: r.key === key } : r.key === key ? { ...r, isCorrect: checked } : r,
      ),
    );
  }

  // --- Ảnh: giữ File trong state rồi gắn vào FormData khi gửi (form tự reset sau mỗi lần gửi) ---
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
  }, [imagePreview]);

  function pickImage(file: File | null) {
    setImageError(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setImageError("Chỉ nhận ảnh JPG, PNG hoặc WEBP.");
      return;
    }
    if (file.size > IMAGE_MAX_BYTES) {
      setImageError("Ảnh tối đa 2MB.");
      return;
    }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setRemoveImage(false);
  }

  function clearImage() {
    setImageFile(null);
    setImagePreview(null);
    setRemoveImage(true);
  }

  const shownImage = imagePreview ?? (question?.imageKey && !removeImage ? fileUrl(question.imageKey) : null);
  const err = state.errors ?? {};
  const optionsJson = JSON.stringify(rows.map((r) => ({ id: r.id, text: r.text, isCorrect: r.isCorrect })));

  return (
    <form
      action={(fd) => {
        if (imageFile) fd.set("image", imageFile);
        formAction(fd);
      }}
      className="contents"
      noValidate
    >
      <DialogBody>
      <FormGrid cols={2}>
      {question ? (
        <input type="hidden" name="id" value={question.id} />
      ) : (
        <input type="hidden" name="courseId" value={courseId} />
      )}
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="options" value={optionsJson} />
      <input type="hidden" name="removeImage" value={removeImage ? "1" : "0"} />

      <FormField
        label="Nội dung câu hỏi"
        htmlFor="content"
        required
        span="full"
        error={err.content}
        hint="Xuống dòng được giữ nguyên khi hiển thị."
      >
        <Textarea
          id="content"
          name="content"
          defaultValue={state.values?.content ?? question?.content}
          maxLength={QUESTION_LIMITS.content}
          rows={3}
          className="min-h-24"
          autoFocus
          aria-invalid={!!err.content}
        />
      </FormField>

        <FormField
          label="Chủ đề"
          htmlFor="topic"
          error={err.topic}
          hint={topics.length > 0 ? "Chọn chủ đề có sẵn hoặc gõ chủ đề mới." : "Gõ chủ đề, VD: An toàn điện."}
        >
          <Input
            id="topic"
            name="topic"
            list={topicListId}
            defaultValue={state.values?.topic ?? question?.topic}
            maxLength={QUESTION_LIMITS.topic}
            placeholder="Không có chủ đề"
            autoComplete="off"
            aria-invalid={!!err.topic}
          />
          <datalist id={topicListId}>
            {topics.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </FormField>

        <FormField label="Loại câu hỏi" htmlFor={`${uid}-type`} required>
          <SegmentedControl
            id={`${uid}-type`}
            ariaLabel="Loại câu hỏi"
            value={type}
            onChange={changeType}
            options={[
              { value: "SINGLE", label: QUESTION_TYPE_LABELS.SINGLE },
              { value: "MULTIPLE", label: QUESTION_TYPE_LABELS.MULTIPLE },
            ]}
            className="w-full"
          />
        </FormField>

      {/* Phương án */}
      <fieldset className="col-span-full grid min-w-0 gap-2">
        <legend className="mb-1 text-[13px] text-foreground">
          Phương án <span className="text-destructive">*</span>
          <span className="ml-2 text-muted-foreground">
            {type === "SINGLE" ? "Chọn 1 đáp án đúng." : "Chọn một hoặc nhiều đáp án đúng."}
          </span>
        </legend>
        {rows.map((row, i) => {
          const inputId = `${uid}-opt-${row.key}`;
          return (
            <div key={row.key} className="flex items-center gap-3">
              {/* Độ rộng cố định để các ô nhập thẳng mép trái */}
              <label
                className={cn(
                  "flex h-[38px] w-14 shrink-0 cursor-pointer items-center gap-2 rounded-md px-2 text-[15px] font-medium",
                  row.isCorrect ? "bg-success/16 text-success" : "text-muted-foreground hover:bg-muted",
                )}
                title={row.isCorrect ? "Đáp án đúng" : "Đánh dấu là đáp án đúng"}
              >
                <input
                  type={type === "SINGLE" ? "radio" : "checkbox"}
                  name={`${uid}-correct`}
                  checked={row.isCorrect}
                  onChange={(e) => markCorrect(row.key, e.target.checked)}
                  className="size-4 accent-success"
                  aria-label={`Phương án ${OPTION_LETTERS[i]} là đáp án đúng`}
                />
                {OPTION_LETTERS[i]}
              </label>
              <Input
                id={inputId}
                value={row.text}
                onChange={(e) => {
                  const text = e.target.value;
                  setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, text } : r)));
                }}
                maxLength={QUESTION_LIMITS.option}
                placeholder={`Phương án ${OPTION_LETTERS[i]}`}
                aria-label={`Nội dung phương án ${OPTION_LETTERS[i]}`}
                aria-invalid={!!err.options && row.text.trim() === ""}
                className="flex-1"
              />
              <Tooltip label="Xoá phương án"><Button
                type="button"
                variant="ghost"
                size="icon-sm"
                disabled={rows.length <= QUESTION_LIMITS.minOptions}
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                aria-label={`Xoá phương án ${OPTION_LETTERS[i]}`}
              >
                <Trash2 className="size-[18px]" />
              </Button></Tooltip>
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-4">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={rows.length >= QUESTION_LIMITS.maxOptions}
            onClick={() => setRows((prev) => [...prev, { key: nextKey(), text: "", isCorrect: false }])}
          >
            <Plus />
            Thêm phương án
          </Button>
          <span className="text-[13px] text-muted-foreground">
            {rows.length}/{QUESTION_LIMITS.maxOptions} phương án (tối thiểu {QUESTION_LIMITS.minOptions})
          </span>
        </div>
        {reselect && (
          <p role="status" className="flex items-center gap-2 rounded-md bg-warning/16 px-3 py-2 text-[13px] text-warning">
            <TriangleAlert className="size-4 shrink-0" />
            Đã đổi sang “{QUESTION_TYPE_LABELS.SINGLE}” — hãy chọn lại 1 đáp án đúng.
          </p>
        )}
        {err.options && (
          <p role="alert" className="text-[13px] text-destructive">
            {err.options}
          </p>
        )}
      </fieldset>

      <FormField
        label="Ảnh minh hoạ"
        htmlFor={`${uid}-image`}
        span="full"
        error={err.image ?? imageError ?? undefined}
        hint="Tuỳ chọn. JPG, PNG hoặc WEBP, tối đa 2MB."
      >
        <div className="flex items-start gap-4">
          {shownImage ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- ảnh qua /api/files có kiểm tra quyền */}
              <img src={shownImage} alt="Ảnh minh hoạ câu hỏi" className="max-h-40 max-w-64 rounded-md border border-border object-contain" />
              <Tooltip label="Bỏ ảnh"><Button
                type="button"
                variant="secondary"
                size="icon-xs"
                onClick={clearImage}
                className="absolute top-1 right-1"
                aria-label="Bỏ ảnh"
              >
                <X />
              </Button></Tooltip>
            </div>
          ) : null}
          <label className="inline-flex h-[38px] cursor-pointer items-center gap-2 rounded-lg bg-secondary px-4 text-[15px] font-medium text-secondary-foreground hover:bg-secondary/80">
            <ImagePlus className="size-4" />
            {shownImage ? "Đổi ảnh" : "Chọn ảnh"}
            <input
              id={`${uid}-image`}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                pickImage(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </FormField>

      <FormField
        label="Giải thích"
        htmlFor="explanation"
        span="full"
        error={err.explanation}
        hint="Tuỳ chọn — hiện cho học viên khi xem lại đáp án."
      >
        <Textarea
          id="explanation"
          name="explanation"
          defaultValue={state.values?.explanation ?? question?.explanation}
          maxLength={QUESTION_LIMITS.explanation}
          rows={2}
          aria-invalid={!!err.explanation}
        />
      </FormField>
      </FormGrid>
      </DialogBody>

      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" disabled={pending} />}>Huỷ</DialogClose>
        <Button type="submit" disabled={pending}>
          {pending ? "Đang lưu..." : question ? "Lưu thay đổi" : "Thêm câu hỏi"}
        </Button>
      </DialogFooter>
    </form>
  );
}
