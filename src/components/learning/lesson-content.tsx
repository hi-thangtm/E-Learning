import { cn } from "@/lib/utils";

/**
 * Nội dung HTML bài Tài liệu, kiểu chữ dễ đọc (cùng bộ thẻ với trình soạn Việc 11: h2 h3 p ul ol li a strong em u).
 * `html` PHẢI là HTML đã lọc ở server (sanitizeLessonHtml) — không bao giờ truyền HTML thô từ người dùng.
 */
export function LessonContent({ html, className }: { html: string; className?: string }) {
  return (
    <div
      className={cn(
        "max-w-[72ch] text-base leading-[1.75] text-foreground",
        "[&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-[22px] [&_h2]:leading-snug [&_h2]:font-medium first:[&_h2]:mt-0",
        "[&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-medium",
        "[&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:my-1",
        "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_strong]:font-semibold",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
