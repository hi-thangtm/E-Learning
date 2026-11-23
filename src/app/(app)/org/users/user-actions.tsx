"use client";

import { useState } from "react";
import Link from "next/link";
import { EllipsisVertical, Eye, KeyRound, Lock, LockOpen, Pencil, TimerReset } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatDateTime } from "@/lib/format";
import { clearLoginLockAction, lockUserAction, unlockUserAction } from "./actions";
import { ResetPasswordDialog } from "./reset-password-dialog";
import type { UserFormValue, UserRowState } from "./types";
import { UserFormDialog } from "./user-form-dialog";
import { Tooltip } from "@/components/ui/tooltip";

const ITEM = "mx-1 gap-3 rounded-md px-3 py-2 text-[15px]";

/**
 * Thao tác trên 1 người dùng: Sửa, Đặt lại mật khẩu, Khoá / Mở khoá, Mở khoá tạm, Xem chi tiết.
 * - variant="menu": menu ⋮ trên mỗi dòng bảng (kèm nút “Mở khoá tạm” khi đang bị khoá tạm)
 * - variant="buttons": hàng nút ở trang chi tiết
 * Dialog nằm ngoài menu và mở bằng state (menu đóng không kéo dialog đóng theo).
 * Quyền thật sự được kiểm tra lại ở server action.
 */
export function UserActions({
  user,
  state,
  variant,
}: {
  user: UserFormValue;
  state: UserRowState;
  variant: "menu" | "buttons";
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [editKey, setEditKey] = useState(0);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetKey, setResetKey] = useState(0);
  const [lockOpen, setLockOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);

  const detailHref = `/org/users/${user.id}`;
  const isActive = state.status === "ACTIVE";
  const canLockAndReset = state.canEdit && !state.isSelf;

  const openEdit = () => {
    setEditKey((k) => k + 1);
    setEditOpen(true);
  };
  const openReset = () => {
    setResetKey((k) => k + 1);
    setResetOpen(true);
  };

  // Chỉ được xem (Admin công ty xem một Admin tập đoàn hoặc một Admin công ty khác — Việc 29B #15)
  if (!state.canEdit) {
    return variant === "menu" ? (
      <div className="flex justify-end">
        <Tooltip label="Xem chi tiết"><Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Xem chi tiết ${user.employeeCode}`}
          render={<Link href={detailHref} />}
          nativeButton={false}
        >
          <Eye className="size-[18px]" />
        </Button></Tooltip>
      </div>
    ) : null;
  }

  const lockDescription = (
    <span className="block space-y-2">
      <span className="block">
        {user.fullName} sẽ không đăng nhập được nữa (kể cả phiên đang mở). Lịch sử học và dữ liệu được giữ nguyên, có
        thể mở khoá lại bất cứ lúc nào.
      </span>
      {user.managedDepartments.length > 0 && (
        <span className="block rounded-md bg-warning/16 px-3 py-2 text-warning">
          Người này đang là trưởng phòng của:{" "}
          <strong className="font-medium">
            {user.managedDepartments.map((d) => `${d.name} (${d.code})`).join(", ")}
          </strong>
          . Hãy vào trang Phòng ban để chỉ định trưởng phòng khác.
        </span>
      )}
    </span>
  );

  const tempLockButton = state.tempLockedUntil && (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setClearOpen(true)}
      title={`Khoá tạm do sai mật khẩu đến ${formatDateTime(state.tempLockedUntil)}`}
    >
      <TimerReset />
      Mở khoá tạm
    </Button>
  );

  return (
    <>
      {variant === "menu" ? (
        <div className="flex items-center justify-end gap-2">
          {tempLockButton}
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Tooltip label="Thao tác"><Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Thao tác cho ${user.employeeCode}`}
                >
                  <EllipsisVertical className="size-[18px]" />
                </Button></Tooltip>
              }
            />
            <DropdownMenuContent align="end" className="w-56 rounded-md py-2 shadow-lg ring-0">
              <DropdownMenuItem className={ITEM} onClick={openEdit}>
                <Pencil className="size-[18px]" />
                Sửa
              </DropdownMenuItem>
              {canLockAndReset && (
                <>
                  <DropdownMenuItem className={ITEM} onClick={openReset}>
                    <KeyRound className="size-[18px]" />
                    Đặt lại mật khẩu
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    variant={isActive ? "destructive" : "default"}
                    className={ITEM}
                    onClick={() => setLockOpen(true)}
                  >
                    {isActive ? <Lock className="size-[18px]" /> : <LockOpen className="size-[18px]" />}
                    {isActive ? "Khoá tài khoản" : "Mở khoá tài khoản"}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem className={ITEM} render={<Link href={detailHref} />}>
                <Eye className="size-[18px]" />
                Xem chi tiết
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Button onClick={openEdit}>
            <Pencil />
            Sửa
          </Button>
          {canLockAndReset && (
            <>
              <Button variant="secondary" onClick={openReset}>
                <KeyRound />
                Đặt lại mật khẩu
              </Button>
              <Button variant={isActive ? "soft-destructive" : "secondary"} onClick={() => setLockOpen(true)}>
                {isActive ? <Lock /> : <LockOpen />}
                {isActive ? "Khoá" : "Mở khoá"}
              </Button>
            </>
          )}
          {tempLockButton}
        </div>
      )}

      <UserFormDialog key={`edit-${editKey}`} user={user} open={editOpen} onOpenChange={setEditOpen} />

      {canLockAndReset && (
        <>
          <ResetPasswordDialog
            key={`reset-${resetKey}`}
            user={{ id: user.id, employeeCode: user.employeeCode, fullName: user.fullName }}
            open={resetOpen}
            onOpenChange={setResetOpen}
          />
          <ConfirmDialog
            open={lockOpen}
            onOpenChange={setLockOpen}
            title={isActive ? `Khoá tài khoản ${user.employeeCode}?` : `Mở khoá tài khoản ${user.employeeCode}?`}
            description={
              isActive
                ? lockDescription
                : `${user.fullName} sẽ đăng nhập lại được bằng mật khẩu hiện tại. Số lần sai mật khẩu được đặt lại.`
            }
            confirmLabel={isActive ? "Khoá" : "Mở khoá"}
            tone={isActive ? "destructive" : "default"}
            action={(isActive ? lockUserAction : unlockUserAction).bind(null, user.id)}
          />
        </>
      )}

      {state.tempLockedUntil && (
        <ConfirmDialog
          open={clearOpen}
          onOpenChange={setClearOpen}
          title={`Mở khoá tạm cho ${user.employeeCode}?`}
          description={`${user.fullName} đang bị khoá tạm do nhập sai mật khẩu nhiều lần (đến ${formatDateTime(state.tempLockedUntil)}). Mở khoá để người này đăng nhập lại ngay.`}
          confirmLabel="Mở khoá tạm"
          action={clearLoginLockAction.bind(null, user.id)}
        />
      )}
    </>
  );
}
