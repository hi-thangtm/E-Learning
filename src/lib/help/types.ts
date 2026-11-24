import type { Role } from "@prisma/client";
import type shotsManifest from "./shots-manifest.json";

/** Tên ảnh minh hoạ — khoá trong shots-manifest.json (do `npm run help:shots` sinh ra). Ảnh không tồn tại → lỗi tsc. */
export type ShotName = keyof typeof shotsManifest;

/** Biểu tượng chương (map sang lucide trong help-page). */
export type HelpIcon = "start" | "learner" | "team" | "content" | "company" | "group" | "faq";

/**
 * Khối nội dung. Chữ trong mọi khối hỗ trợ đúng 1 cú pháp: `**nhãn nút**` → in đậm (không có HTML).
 * - steps: danh sách bước đánh số; list: gạch đầu dòng; tip / warn: hộp lưu ý; shot: ảnh chụp màn hình.
 */
export type HelpBlock =
  | { type: "p"; text: string }
  | { type: "steps"; items: string[] }
  | { type: "list"; items: string[] }
  | { type: "tip"; text: string }
  | { type: "warn"; text: string }
  | { type: "table"; head: string[]; rows: string[][] }
  | { type: "shot"; name: ShotName; caption: string; roles?: Role[] }
  | { type: "shots"; items: { name: ShotName; caption: string }[] };

export type HelpSection = {
  /** id dùng làm anchor (#id) — duy nhất trong cả trang */
  id: string;
  title: string;
  /** Không khai báo = theo vai trò của chương */
  roles?: Role[];
  blocks: HelpBlock[];
};

export type HelpChapter = {
  id: string;
  title: string;
  description: string;
  icon: HelpIcon;
  roles: Role[];
  sections: HelpSection[];
};
