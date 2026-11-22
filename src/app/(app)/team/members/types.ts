/** Kiểu dùng chung giữa bảng Nhân viên / hộp nhắc nhở (client) và server actions. */

/** Chọn từng người (id) hoặc “tất cả theo bộ lọc” (gửi searchParams hiện tại, server tự tìm lại trong phạm vi). */
export type MemberSelection = { mode: "ids"; ids: string[] } | { mode: "filter"; params: Record<string, string> };

/** overdue = các khoá đang quá hạn; all = mọi khoá được giao chưa hoàn thành */
export type ReminderMode = "overdue" | "all";

export type ReminderPreview = { ok: true; people: number; notifications: number } | { ok: false; message: string };
export type ReminderResult = { ok: true; message: string } | { ok: false; message: string };
