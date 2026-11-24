import { Fragment } from "react";

/**
 * Chữ hướng dẫn: chỉ hỗ trợ `**nhãn**` → in đậm (tên nút / tab / ô nhập). Không nhận HTML → không có rủi ro chèn mã.
 * Dùng được ở cả server và client component.
 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <strong key={i} className="font-medium text-foreground">
            {part}
          </strong>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}
