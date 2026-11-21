import Image from "next/image";
import { ImageIcon } from "lucide-react";
import { fileUrl } from "@/lib/file-url";
import { cn } from "@/lib/utils";

/**
 * Ảnh bìa khoá học (tỉ lệ 16:9). Ảnh đọc qua /api/files (bắt buộc đăng nhập) nên dùng `unoptimized`:
 * bộ tối ưu ảnh của Next gọi lại URL mà không kèm cookie -> sẽ bị 401.
 */
export function CourseThumbnail({
  thumbnailKey,
  alt,
  className,
  fallbackSrc,
  sizes = "160px",
}: {
  thumbnailKey: string | null;
  alt: string;
  className?: string;
  /** Ảnh mặc định khi khoá chưa có ảnh bìa (VD ảnh theo danh mục — src/lib/course-cover.ts) */
  fallbackSrc?: string;
  sizes?: string;
}) {
  const src = thumbnailKey ? fileUrl(thumbnailKey) : fallbackSrc;
  return (
    <span className={cn("relative block aspect-video shrink-0 overflow-hidden rounded-sm bg-muted", className)}>
      {src ? (
        <Image src={src} alt={alt} fill unoptimized sizes={sizes} className="object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center text-foreground/30" aria-hidden>
          <ImageIcon className="size-1/2 max-h-6 max-w-6" />
        </span>
      )}
    </span>
  );
}
