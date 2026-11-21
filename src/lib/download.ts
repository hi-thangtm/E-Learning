/** Tải về một file nhận dạng base64 (VD: file Excel do server action tạo) — chỉ dùng ở trình duyệt. */
export function downloadBase64(
  base64: string,
  fileName: string,
  mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
): void {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Giải phóng bộ nhớ sau khi trình duyệt bắt đầu tải
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
