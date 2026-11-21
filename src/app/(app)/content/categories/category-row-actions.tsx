"use client";

import { useTransition } from "react";
import { ArrowDown, ArrowUp, Eye, EyeOff, Pencil } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { moveCategoryAction, toggleCategoryAction } from "./actions";
import { CategoryFormDialog, type CategoryFormValue } from "./category-form-dialog";

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
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Đưa “${category.name}” lên trên`}
        title="Lên trên"
        disabled={isFirst || moving}
        onClick={() => move("up")}
      >
        <ArrowUp className="size-[18px]" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Đưa “${category.name}” xuống dưới`}
        title="Xuống dưới"
        disabled={isLast || moving}
        onClick={() => move("down")}
      >
        <ArrowDown className="size-[18px]" />
      </Button>
      <CategoryFormDialog
        category={category}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Sửa “${category.name}”`} title="Sửa">
            <Pencil className="size-[18px]" />
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isActive ? `Ẩn “${category.name}”` : `Hiện “${category.name}”`}
            title={isActive ? "Ẩn" : "Hiện lại"}
          >
            {isActive ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </Button>
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
