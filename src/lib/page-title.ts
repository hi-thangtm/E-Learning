/** Tiêu đề tab trình duyệt kèm tên đối tượng: “Tên (cắt 60 ký tự) · Loại trang”. Tên phải lấy từ truy vấn ĐÃ lọc phạm vi. */
export function pageTitle(name: string | null | undefined, page: string): string {
  if (!name) return page;
  const short = name.length > 60 ? `${name.slice(0, 59)}…` : name;
  return `${short} · ${page}`;
}
