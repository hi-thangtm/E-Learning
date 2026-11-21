/** URL để hiển thị file đã lưu (qua route /api/files có kiểm tra đăng nhập). Dùng được cả server và trình duyệt. */
export function fileUrl(key: string): string {
  return `/api/files/${key}`;
}
