/**
 * Quy tắc học tuần tự (docs/database.md — Quy tắc 4) — hàm THUẦN, dùng được ở cả server và trình duyệt
 * (trang học tính lại ✓ / 🔒 ngay khi một bài xong mà không tải lại trang).
 */

/** Bài đầu luôn mở; bài sau mở khi bài liền trước (xuyên chương) đã xong; bài đã xong luôn mở (xem lại). */
export function applySequence<T extends { completed: boolean }>(lessons: T[]): (T & { locked: boolean })[] {
  return lessons.map((l, i) => ({ ...l, locked: i > 0 && !l.completed && !lessons[i - 1].completed }));
}

type SeqLesson = { id: string; completed: boolean; locked: boolean };
type SeqSection<L extends SeqLesson> = { lessons: L[] };

/** Đánh dấu thêm các bài đã xong rồi tính lại khoá cho cả mục lục (giữ nguyên cấu trúc chương). */
export function relock<L extends SeqLesson, S extends SeqSection<L>>(sections: S[], completedIds: Iterable<string> = []): S[] {
  const done = new Set(completedIds);
  const flat = applySequence(sections.flatMap((s) => s.lessons.map((l) => ({ ...l, completed: l.completed || done.has(l.id) }))));
  let i = 0;
  return sections.map((s) => ({ ...s, lessons: s.lessons.map(() => flat[i++] as L) }));
}

/** Số giây tối thiểu phải mở bài tài liệu trước khi bấm “Đã đọc xong” (trình duyệt đếm ngược; server cho lệch 2 giây). */
export const DOCUMENT_MIN_SECONDS = 15;

/** Tua quá vị trí đã xem thật (maxWatchedSeconds) hơn số giây này = tua vượt → bị kéo về (Quy tắc 4). */
export const VIDEO_SEEK_TOLERANCE = 15;
