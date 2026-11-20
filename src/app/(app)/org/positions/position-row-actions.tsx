"use client";

import { Eye, EyeOff, Pencil } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { togglePositionAction } from "./actions";
import { PositionFormDialog, type PositionFormValue } from "./position-form-dialog";

/** Nút sửa + ẩn/hiện trên mỗi dòng (chỉ hiện cho Admin tập đoàn). */
export function PositionRowActions({
  position,
  isActive,
  userCount,
}: {
  position: PositionFormValue;
  isActive: boolean;
  userCount: number;
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <PositionFormDialog
        position={position}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Sửa ${position.code}`} title="Sửa">
            <Pencil className="size-[18px]" />
          </Button>
        }
      />
      <ConfirmDialog
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={isActive ? `Ẩn ${position.code}` : `Hiện ${position.code}`}
            title={isActive ? "Ẩn" : "Hiện lại"}
          >
            {isActive ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
          </Button>
        }
        title={isActive ? `Ẩn chức danh ${position.code}?` : `Hiện lại chức danh ${position.code}?`}
        description={
          isActive
            ? userCount > 0
              ? `Đang có ${userCount} nhân viên giữ chức danh “${position.name}”. Họ vẫn giữ nguyên chức danh, nhưng sẽ không chọn được chức danh này cho người mới.`
              : `Chức danh “${position.name}” sẽ không chọn được khi tạo hoặc sửa nhân viên. Có thể hiện lại bất cứ lúc nào.`
            : `Chức danh “${position.name}” sẽ dùng lại được khi tạo hoặc sửa nhân viên.`
        }
        confirmLabel={isActive ? "Ẩn" : "Hiện lại"}
        tone={isActive ? "destructive" : "default"}
        action={togglePositionAction.bind(null, position.id)}
      />
    </div>
  );
}
