/**
 * Đọc tham số bảng danh sách từ URL (searchParams) — dùng trong page.tsx (server).
 * Giá trị sai / thiếu thì lấy mặc định, không báo lỗi.
 *
 *   const { q, page, pageSize, skip, take } = parseTableParams(await searchParams);
 */

export type SearchParams = { [key: string]: string | string[] | undefined };

export const PAGE_SIZES = [10, 25, 50] as const;
export const DEFAULT_PAGE_SIZE = 10;

/** Lấy 1 giá trị dạng chuỗi (đã trim) từ searchParams. */
export function getParam(searchParams: SearchParams, key: string): string {
  const value = searchParams[key];
  const first = Array.isArray(value) ? value[0] : value;
  return (first ?? "").trim();
}

/** Lấy giá trị nếu nằm trong danh sách cho phép, ngược lại trả undefined. */
export function getEnumParam<T extends string>(
  searchParams: SearchParams,
  key: string,
  allowed: readonly T[],
): T | undefined {
  const value = getParam(searchParams, key);
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

function toPositiveInt(value: string, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function parseTableParams(searchParams: SearchParams) {
  const q = getParam(searchParams, "q").slice(0, 100);
  const page = toPositiveInt(getParam(searchParams, "page"), 1);
  const requestedSize = toPositiveInt(getParam(searchParams, "pageSize"), DEFAULT_PAGE_SIZE);
  const pageSize = (PAGE_SIZES as readonly number[]).includes(requestedSize) ? requestedSize : DEFAULT_PAGE_SIZE;

  return { q, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

/** Tạo đường dẫn giữ nguyên các tham số hiện có, ghi đè những tham số truyền vào (null/"" = xoá). */
export function buildHref(
  pathname: string,
  searchParams: SearchParams,
  overrides: Record<string, string | number | null | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (v) params.set(key, v);
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null || value === undefined || value === "") params.delete(key);
    else params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
