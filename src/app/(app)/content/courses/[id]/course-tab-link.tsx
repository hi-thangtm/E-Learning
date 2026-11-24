"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UnsavedChangesDialog } from "@/components/unsaved-changes-dialog";
import { setInfoDirty, useInfoDirty } from "./info-dirty-store";

/**
 * Link 1 tab của trang soạn khoá. Đang ở tab Thông tin mà có thay đổi chưa lưu → hỏi “Bỏ thay đổi chưa lưu?” trước khi chuyển tab (Việc 33 F9).
 */
export function CourseTabLink({
  href,
  selected,
  className,
  children,
}: {
  href: string;
  selected: boolean;
  className: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const dirty = useInfoDirty();
  const [confirm, setConfirm] = useState(false);

  return (
    <>
      <Link
        href={href}
        scroll={false}
        aria-current={selected ? "page" : undefined}
        className={className}
        onClick={(e) => {
          if (!dirty || selected) return;
          e.preventDefault();
          setConfirm(true);
        }}
      >
        {children}
      </Link>
      <UnsavedChangesDialog
        open={confirm}
        description="Tab Thông tin có thay đổi chưa lưu. Chuyển tab bây giờ thì các thay đổi này sẽ mất."
        onStay={() => setConfirm(false)}
        onDiscard={() => {
          setConfirm(false);
          setInfoDirty(false);
          router.push(href, { scroll: false });
        }}
      />
    </>
  );
}
