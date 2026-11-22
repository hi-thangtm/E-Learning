"use client";

import { useSyncExternalStore } from "react";

/**
 * Tab Thông tin có thay đổi chưa lưu không — để hộp Phát hành (ở thanh trên) nhắc "Lưu thông tin trước khi phát hành".
 * Chỉ là nhắc nhở, không chặn phát hành. Trạng thái nằm trong bộ nhớ trình duyệt của trang soạn.
 */

let dirty = false;
const listeners = new Set<() => void>();

export function setInfoDirty(value: boolean) {
  if (dirty === value) return;
  dirty = value;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInfoDirty(): boolean {
  return useSyncExternalStore(subscribe, () => dirty, () => false);
}
