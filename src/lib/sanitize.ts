import "server-only";
import sanitizeHtml from "sanitize-html";

/**
 * Lọc HTML nội dung bài Tài liệu — CHỈ chạy ở server, TRƯỚC khi lưu (không tin HTML từ trình duyệt).
 * Chỉ giữ đúng các thẻ của thanh công cụ soạn thảo: đoạn, xuống dòng, H2, H3, đậm, nghiêng, gạch chân,
 * danh sách chấm / số, liên kết. Liên kết chỉ http/https, luôn mở tab mới với rel="noopener noreferrer".
 * <script>, <style>, sự kiện on*, style=, javascript: … đều bị loại.
 */
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: ["p", "br", "h2", "h3", "strong", "em", "u", "ul", "ol", "li", "a"],
  allowedAttributes: { a: ["href", "target", "rel"] },
  allowedSchemes: ["http", "https"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  // Bỏ hẳn cả phần bên trong các thẻ nguy hiểm (không chỉ bỏ thẻ)
  nonTextTags: ["script", "style", "textarea", "option", "noscript", "iframe", "object", "embed"],
  disallowedTagsMode: "discard",
  transformTags: {
    b: "strong",
    i: "em",
    h1: "h2",
    h4: "h3",
    h5: "h3",
    h6: "h3",
    a: (_tagName, attribs): sanitizeHtml.Tag => {
      const href = (attribs.href ?? "").trim();
      // Chỉ http/https. Link khác (javascript:, data:, tương đối...) -> đổi thành thẻ không cho phép
      // để sanitize-html bỏ thẻ nhưng GIỮ chữ bên trong.
      if (!/^https?:\/\//i.test(href)) return { tagName: "span", attribs: {} };
      return { tagName: "a", attribs: { href, target: "_blank", rel: "noopener noreferrer" } };
    },
  },
};

export function sanitizeLessonHtml(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

/** HTML chỉ toàn thẻ rỗng / khoảng trắng (VD "<p></p>") -> coi như không có nội dung. */
export function isBlankHtml(html: string | null | undefined): boolean {
  if (!html) return true;
  const text = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, " ")
    .trim();
  return text.length === 0;
}
