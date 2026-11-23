/**
 * Dùng chung cho mọi script đo hiệu năng (Việc 30).
 *
 * LỚP BẢO VỆ: mọi script perf chạy với `tsx --env-file=.env.perf` và gọi `assertPerfDatabase()` ĐẦU TIÊN —
 * từ chối chạy nếu tên database trong DATABASE_URL không phải `elearning_perf` (tránh xoá / ghi đè database thật).
 */

export const PERF_DB_NAME = "elearning_perf";

/** Tên database trong một chuỗi kết nối PostgreSQL. */
export function databaseNameOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, "")) || null;
  } catch {
    return null;
  }
}

/** Dừng ngay (mã 1) nếu DATABASE_URL không trỏ tới elearning_perf. Trả về DATABASE_URL. */
export function assertPerfDatabase(): string {
  const url = process.env.DATABASE_URL;
  const name = databaseNameOf(url);
  if (name !== PERF_DB_NAME) {
    console.error(
      `✘ Từ chối chạy: DATABASE_URL đang trỏ tới database "${name ?? "(không đọc được)"}", không phải "${PERF_DB_NAME}".\n` +
        `  Script đo hiệu năng chỉ chạy với .env.perf (npm run perf:env để tạo).`,
    );
    process.exit(1);
  }
  return url!;
}

/** Đổi tên database trong chuỗi kết nối (giữ nguyên user / mật khẩu / tham số). */
export function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

// ---------------------------------------------------------------------------------------------
// Ngẫu nhiên có hạt giống (mulberry32) — chạy lại ra đúng bộ dữ liệu, không cần thư viện ngoài

export class Rng {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  /** Số thực [0, 1) */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Số nguyên [min, max] */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
  /** Chọn theo trọng số: [[giá trị, trọng số], ...] */
  weighted<T>(pairs: readonly (readonly [T, number])[]): T {
    const total = pairs.reduce((s, [, w]) => s + w, 0);
    let r = this.next() * total;
    for (const [v, w] of pairs) {
      if ((r -= w) < 0) return v;
    }
    return pairs[pairs.length - 1][0];
  }
  /** k phần tử khác nhau (giữ thứ tự ngẫu nhiên) */
  sample<T>(items: readonly T[], k: number): T[] {
    const copy = items.slice();
    const n = Math.min(k, copy.length);
    for (let i = 0; i < n; i++) {
      const j = i + Math.floor(this.next() * (copy.length - i));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy.slice(0, n);
  }
  shuffle<T>(items: T[]): T[] {
    return this.sample(items, items.length);
  }
}

/** Bộ sinh id tất định (dạng giống cuid: chữ thường + số, 25 ký tự, bắt đầu bằng chữ). */
export function idFactory(rng: Rng, prefix = "p") {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  return () => {
    let s = prefix;
    while (s.length < 25) s += alphabet[Math.floor(rng.next() * alphabet.length)];
    return s;
  };
}

/** Tham số dòng lệnh dạng --key value / --key=value / --flag */
export function argOf(name: string): string | undefined {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === `--${name}`) return argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
    if (a.startsWith(`--${name}=`)) return a.slice(name.length + 3);
  }
  return undefined;
}

export const DAY = 86_400_000;
