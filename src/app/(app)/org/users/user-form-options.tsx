"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserFormOptions } from "./types";

/**
 * Danh sách công ty / phòng ban / chức danh / vai trò cho form người dùng.
 * page.tsx đưa vào 1 lần, các dialog (thêm + sửa từng dòng) đọc lại — không phải truyền vào từng dòng.
 */
const UserFormOptionsContext = createContext<UserFormOptions | null>(null);

export function UserFormOptionsProvider({ value, children }: { value: UserFormOptions; children: ReactNode }) {
  return <UserFormOptionsContext.Provider value={value}>{children}</UserFormOptionsContext.Provider>;
}

export function useUserFormOptions(): UserFormOptions {
  const value = useContext(UserFormOptionsContext);
  if (!value) throw new Error("useUserFormOptions phải dùng bên trong UserFormOptionsProvider");
  return value;
}
