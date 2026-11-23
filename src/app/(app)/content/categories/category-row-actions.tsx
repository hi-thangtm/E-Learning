"use client";

import { useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { moveCategoryAction, toggleCategoryAction } from "./actions";
import { CategoryFormDialog, type CategoryFormValue } from "./category-form-dialog";
import { Tooltip } from "@/components/ui/tooltip";

/** Nút trên mỗi dòng (chỉ Admin tập đoàn): lên / xuống, sửa, ẩn / hiện. */
export function CategoryRowActions({
  category,
  isActive,
  courseCount,
  isFirst,
  isLast,
}: {
  category: CategoryFormValue;
  isActive: boolean;
  courseCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [moving, startMoving] = useTransition();

  function move(direction: "up" | "down") {
    startMoving(async () => {
      try {
        const result = await moveCategoryAction(category.id, direction);
        if (!result.ok && result.message) toast.error(result.message);
      } catch {
        toast.error("Không đổi được thứ tự, vui lòng thử lại.");
      }
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip label="Lên trên"><Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Đưa “${category.name}” lên trên`}
        disabled={isFirst || moving}
        onClick={() => move("up")}
      >
        <ArrowUp className="size-[18px]" />
      </Button></Tooltip>
      <Tooltip label="Xuống dưới"><Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Đưa “${category.name}” xuống dưới`}
        disabled={isLast || moving}
        onClick={() => move("down")}
      >
        <ArrowDown className="size-[18px]" />
      </Button></Tooltip>
      <CategoryFormDialog
        category={category}
        trigger={
          <Tooltip label="Sửa"><Button variant="ghost" size="icon-sm" aria-label={`Sửa “${category.name}”`}>
            <Pencil className="size-[18px]" />
          </Button></Tooltip>
        }
      />
      <ConfirmDialog
        trigger={
          <Tooltip label={isActive ? "Ẩn" : "Hiện lại"}><Button
            variant="ghost"
            size="icon-sm"
            aria-label={isActive ? `Ẩn “${category.name}”` : `Hiện “${category.name}”`}
          >
            {isActive ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </Button></Tooltip>
        }
        title={isActive ? `Ẩn danh mục “${category.name}”?` : `Hiện lại danh mục “${category.name}”?`}
        description={
          isActive
            ? courseCount > 0
              ? `Đang có ${courseCount} khoá học thuộc danh mục này. Các khoá đó vẫn giữ nguyên danh mục, nhưng sẽ không chọn được danh mục này cho khoá học mới.`
              : "Danh mục sẽ không chọn được khi tạo khoá học mới. Có thể hiện lại bất cứ lúc nào."
            : "Danh mục sẽ chọn lại được khi tạo hoặc sửa khoá học."
        }
        confirmLabel={isActive ? "Ẩn" : "Hiện lại"}
        tone={isActive ? "destructive" : "default"}
        action={toggleCategoryAction.bind(null, category.id)}
      />
    </div>
  );
}
