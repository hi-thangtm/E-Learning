/**
 * Chữ cái viết tắt cho avatar (docs/design-system.md — mục 5.5).
 * Tên tiếng Việt: chữ đầu của họ (từ đầu) + chữ đầu của tên (từ cuối).
 *   "Nguyễn Văn An" -> "NA", "Trần Bình" -> "TB", "An" -> "A"
 */
export function getInitials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = words[0][0] ?? "";
  if (words.length === 1) return first.toLocaleUpperCase("vi");
  const last = words[words.length - 1][0] ?? "";
  return (first + last).toLocaleUpperCase("vi");
}
