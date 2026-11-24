"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/** Trang dành cho học viên — co giãn theo màn hình, hỗ trợ điện thoại (≥ 375px). */
export const LEARNER_PATHS = ["/dashboard", "/my-courses", "/learning-paths", "/library", "/certificates", "/notifications", "/help"];

export function isLearnerPath(pathname: string): boolean {
  return LEARNER_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Vùng nội dung (docs/design-system.md mục 4.3):
 * - Trang học viên: co giãn, hỗ trợ điện thoại.
 * - Trang quản trị: giữ bố cục máy tính (rộng tối thiểu 900px); màn hình nhỏ cuộn ngang trong khung, không vỡ trang.
 */
export function ContentFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isLearnerPath(pathname)) return <>{children}</>;
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:-mx-6 sm:px-6">
      <div className="min-w-[900px]">{children}</div>
    </div>
  );
}
