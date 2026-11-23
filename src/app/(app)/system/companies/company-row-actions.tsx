"use client";

import { useState } from "react";
import { EllipsisVertical, Pencil, Power, PowerOff, UserPlus } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toggleCompanyAction } from "./actions";
import { CompanyAdminDialog } from "./company-admin-dialog";
import { CompanyFormDialog, type CompanyFormValue } from "./company-form-dialog";
import { Tooltip } from "@/components/ui/tooltip";

/**
 * Thao tác trên mỗi dòng công ty: nút Sửa + menu ⋮ (chỉ công ty con).
 * Mục trong menu mở dialog qua state (dialog nằm ngoài menu, không bị đóng theo menu).
 */
export function CompanyRowActions({
  company,
  isActive,
  activeUsers,
}: {
  company: CompanyFormValue;
  isActive: boolean;
  activeUsers: number;
}) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <CompanyFormDialog
        company={company}
        trigger={
          <Tooltip label="Sửa"><Button variant="ghost" size="icon-sm" aria-label={`Sửa ${company.code}`}>
            <Pencil className="size-[18px]" />
          </Button></Tooltip>
        }
      />

      {company.isGroup ? (
        // Giữ chỗ để cột thao tác thẳng hàng
        <span className="size-[30px]" aria-hidden />
      ) : (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Tooltip label="Thao tác khác"><Button variant="ghost" size="icon-sm" aria-label={`Thao tác khác cho ${company.code}`}>
                  <EllipsisVertical className="size-[18px]" />
                </Button></Tooltip>
              }
            />
            <DropdownMenuContent align="end" className="w-56 rounded-md py-2 shadow-lg ring-0">
              <DropdownMenuItem
                className="mx-1 gap-3 rounded-md px-3 py-2 text-[15px]"
                onClick={() => setAdminOpen(true)}
              >
                <UserPlus className="size-[18px]" />
                Tạo tài khoản admin
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant={isActive ? "destructive" : "default"}
                className="mx-1 gap-3 rounded-md px-3 py-2 text-[15px]"
                onClick={() => setToggleOpen(true)}
              >
                {isActive ? <PowerOff className="size-[18px]" /> : <Power className="size-[18px]" />}
                {isActive ? "Tạm ngưng" : "Kích hoạt lại"}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <CompanyAdminDialog
            company={{ id: company.id, code: company.code, name: company.name }}
            open={adminOpen}
            onOpenChange={setAdminOpen}
          />

          <ConfirmDialog
            open={toggleOpen}
            onOpenChange={setToggleOpen}
            title={isActive ? `Tạm ngưng công ty ${company.code}?` : `Kích hoạt lại công ty ${company.code}?`}
            description={
              isActive
                ? `${activeUsers} nhân viên đang làm của “${company.name}” sẽ không đăng nhập được (kể cả phiên đang mở). Dữ liệu được giữ nguyên, có thể kích hoạt lại bất cứ lúc nào.`
                : `${activeUsers} nhân viên đang làm của “${company.name}” sẽ đăng nhập lại được.`
            }
            confirmLabel={isActive ? "Tạm ngưng" : "Kích hoạt lại"}
            tone={isActive ? "destructive" : "default"}
            action={toggleCompanyAction.bind(null, company.id)}
          />
        </>
      )}
    </div>
  );
}
