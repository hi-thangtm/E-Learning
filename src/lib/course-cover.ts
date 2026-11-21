import { fileUrl } from "@/lib/file-url";

/**
 * Ảnh bìa khoá học: ảnh đã tải lên (qua /api/files) hoặc ảnh mặc định chọn CỐ ĐỊNH theo danh mục
 * (cùng danh mục luôn cùng ảnh). Ảnh mặc định lấy từ Vuexy (public/images/courses/default-1..8.png).
 * Dùng được cả server và trình duyệt.
 */
const DEFAULT_COUNT = 8;

export function defaultCoverUrl(categoryId: string | null | undefined): string {
  if (!categoryId) return "/images/courses/default-1.png";
  let hash = 0;
  for (let i = 0; i < categoryId.length; i++) hash = (hash * 31 + categoryId.charCodeAt(i)) >>> 0;
  return `/images/courses/default-${(hash % DEFAULT_COUNT) + 1}.png`;
}

export function courseCoverUrl(course: { thumbnailUrl: string | null; categoryId: string | null }): string {
  return course.thumbnailUrl ? fileUrl(course.thumbnailUrl) : defaultCoverUrl(course.categoryId);
}
