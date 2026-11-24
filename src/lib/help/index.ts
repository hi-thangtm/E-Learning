import type { Role } from "@prisma/client";
import { normalizeSearch } from "@/lib/tree";
import { HELP_CHAPTERS } from "./content";
import type { HelpBlock, HelpChapter } from "./types";

export type { HelpBlock, HelpChapter, HelpSection, ShotName } from "./types";

/** Các chương + mục người dùng vai trò `role` được xem (mục / ảnh có `roles` riêng cũng được lọc). */
export function helpChaptersFor(role: Role): HelpChapter[] {
  return HELP_CHAPTERS.filter((c) => c.roles.includes(role))
    .map((c) => ({
      ...c,
      sections: c.sections
        .filter((s) => !s.roles || s.roles.includes(role))
        .map((s) => ({ ...s, blocks: s.blocks.filter((b) => b.type !== "shot" || !b.roles || b.roles.includes(role)) })),
    }))
    .filter((c) => c.sections.length > 0);
}

export type HelpSearchEntry = {
  chapterId: string;
  chapterTitle: string;
  sectionId: string;
  title: string;
  /** Đoạn chữ đầu tiên của mục (hiển thị dưới kết quả) */
  excerpt: string;
  /** Chữ đã chuẩn hoá (thường, bỏ dấu) để so khớp */
  haystack: string;
};

const stripMarks = (s: string) => s.replace(/\*\*/g, "");

function blockText(b: HelpBlock): string {
  switch (b.type) {
    case "p":
    case "tip":
    case "warn":
      return b.text;
    case "steps":
    case "list":
      return b.items.join(" ");
    case "table":
      return [...b.head, ...b.rows.flat()].join(" ");
    case "shot":
      return b.caption;
    case "shots":
      return b.items.map((i) => i.caption).join(" ");
  }
}

/** Chỉ mục tìm kiếm phía trình duyệt (chỉ gồm nội dung người dùng được xem). */
export function buildHelpSearchIndex(chapters: HelpChapter[]): HelpSearchEntry[] {
  return chapters.flatMap((c) =>
    c.sections.map((s) => {
      const text = stripMarks(s.blocks.map(blockText).join(" "));
      const first = s.blocks.find((b) => b.type === "p" || b.type === "tip" || b.type === "steps" || b.type === "list");
      const excerpt = stripMarks(first ? blockText(first) : text).slice(0, 160);
      return {
        chapterId: c.id,
        chapterTitle: c.title,
        sectionId: s.id,
        title: s.title,
        excerpt,
        haystack: normalizeSearch(`${s.title} ${s.title} ${text}`),
      };
    }),
  );
}
