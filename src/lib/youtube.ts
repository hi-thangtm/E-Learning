/**
 * Tách mã video YouTube (11 ký tự) từ link — dùng chung server + trình duyệt.
 * Nhận: youtube.com/watch?v=…, m.youtube.com, music.youtube.com, youtu.be/…, /shorts/…, /embed/…, /live/…,
 * youtube-nocookie.com/embed/…, có hoặc không tham số (?t=, &list=…), hoặc chỉ mã 11 ký tự.
 * Không nhận được -> null.
 */

const ID = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

export function parseYoutubeId(input: string): string | null {
  const value = input.trim();
  if (ID.test(value)) return value;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (host === "youtu.be" || host === "www.youtu.be") {
    const id = url.pathname.split("/")[1] ?? "";
    return ID.test(id) ? id : null;
  }
  if (!HOSTS.has(host)) return null;

  if (url.pathname === "/watch") {
    const id = url.searchParams.get("v") ?? "";
    return ID.test(id) ? id : null;
  }
  const [, kind, id = ""] = url.pathname.split("/");
  if (["shorts", "embed", "live", "v", "e"].includes(kind) && ID.test(id)) return id;
  return null;
}

/** Link xem thường (để admin mở kiểm tra). */
export function youtubeWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** 754 -> "12:34", 3725 -> "1:02:05". */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds < 0) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}
