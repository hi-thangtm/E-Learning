"use client";

import { Pencil, Power, PowerOff, Trash2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { deleteQuestionAction, toggleQuestionAction } from "./actions";
import { QuestionFormDialog, type QuestionFormValue } from "./question-form-dialog";
import { Tooltip } from "@/components/ui/tooltip";

const PUBLISHED_HINT = "Khoá đã phát hành — chỉ tắt được câu hỏi";

/** Sửa · Tắt / Bật · Xoá (chỉ khi khoá chưa phát hành lần nào). */
export function QuestionRowActions({
  courseId,
  question,
  isActive,
  canDelete,
  topics,
}: {
  courseId: string;
  question: QuestionFormValue;
  isActive: boolean;
  /** Khoá chưa phát hành lần nào (currentVersion = 0) */
  canDelete: boolean;
  topics: string[];
}) {
  const preview = question.content.length > 120 ? `${question.content.slice(0, 120)}…` : question.content;

  return (
    <div className="flex items-center justify-end gap-1">
      <QuestionFormDialog
        courseId={courseId}
        question={question}
        topics={topics}
        trigger={
          <Tooltip label="Sửa"><Button variant="ghost" size="icon-sm" aria-label="Sửa câu hỏi">
            <Pencil className="size-[18px]" />
          </Button></Tooltip>
        }
      />
      <ConfirmDialog
        trigger={
          <Tooltip label={isActive ? (canDelete ? "Tắt" : `Tắt — ${PUBLISHED_HINT}`) : "Bật lại"}><Button
            variant="ghost"
            size="icon-sm"
            aria-label={isActive ? "Tắt câu hỏi" : "Bật lại câu hỏi"}
          >
            {isActive ? <PowerOff className="size-[18px]" /> : <Power className="size-[18px]" />}
          </Button></Tooltip>
        }
        title={isActive ? "Tắt câu hỏi này?" : "Bật lại câu hỏi này?"}
        description={
          <span className="whitespace-pre-line">
            {isActive
              ? `Câu hỏi sẽ không được rút vào đề kiểm tra nữa. Bài đã làm vẫn giữ nguyên.\n\n“${preview}”`
              : `Câu hỏi sẽ được rút vào đề kiểm tra trở lại.\n\n“${preview}”`}
          </span>
        }
        confirmLabel={isActive ? "Tắt" : "Bật lại"}
        tone={isActive ? "destructive" : "default"}
        action={toggleQuestionAction.bind(null, question.id)}
      />
      {canDelete ? (
        <ConfirmDialog
          trigger={
            <Tooltip label="Xoá"><Button variant="ghost" size="icon-sm" aria-label="Xoá câu hỏi">
              <Trash2 className="size-[18px]" />
            </Button></Tooltip>
          }
          title="Xoá hẳn câu hỏi này?"
          description={
            <span className="whitespace-pre-line">
              {`Khoá chưa phát hành nên được xoá hẳn (kể cả ảnh minh hoạ). Không khôi phục được.\n\n“${preview}”`}
            </span>
          }
          confirmLabel="Xoá"
          tone="destructive"
          action={deleteQuestionAction.bind(null, question.id)}
        />
      ) : (
        // Giữ chỗ để cột thao tác thẳng hàng; chú thích lý do không xoá được
        <span className="inline-flex size-[30px] items-center justify-center text-foreground/25" title={PUBLISHED_HINT}>
          <Trash2 className="size-[18px]" aria-hidden />
          <span className="sr-only">{PUBLISHED_HINT}</span>
        </span>
      )}
    </div>
  );
}
