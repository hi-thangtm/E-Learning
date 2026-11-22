const TIME_ZONE = "Asia/Ho_Chi_Minh";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function parts(formatter: Intl.DateTimeFormat, date: Date) {
  const map: Record<string, string> = {};
  for (const p of formatter.formatToParts(date)) map[p.type] = p.value;
  return map;
}

/** Ngày dạng dd/MM/yyyy theo giờ Việt Nam. */
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const p = parts(dateFormatter, new Date(date));
  return `${p.day}/${p.month}/${p.year}`;
}

/** Ngày giờ dạng dd/MM/yyyy HH:mm theo giờ Việt Nam. */
export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const p = parts(dateTimeFormatter, new Date(date));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * Thời gian tương đối tiếng Việt: "vừa xong" / "5 phút trước" / "3 giờ trước" (cùng ngày) / "hôm qua" / dd/MM/yyyy.
 * Ngày tính theo giờ Việt Nam.
 */
export function formatRelative(date: Date | string, now: Date = new Date()): string {
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (diffMs < 60_000) return "vừa xong";
  const today = vnIsoDate(now);
  const day = vnIsoDate(d);
  if (day === today) return minutes < 60 ? `${minutes} phút trước` : `${Math.floor(minutes / 60)} giờ trước`;
  if (day === addDaysIso(today, -1)) return "hôm qua";
  return formatDate(d);
}

/** Số có dấu chấm ngăn cách hàng nghìn (1.234). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

const dateTimeSecondsFormatter = new Intl.DateTimeFormat("vi-VN", {
  timeZone: TIME_ZONE,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** Ngày giờ dạng dd/MM/yyyy HH:mm:ss theo giờ Việt Nam (nhật ký thao tác). */
export function formatDateTimeSeconds(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const p = parts(dateTimeSecondsFormatter, new Date(date));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

const isoDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Ngày hôm nay (hoặc `date`) theo giờ Việt Nam, dạng yyyy-MM-dd. */
export function vnIsoDate(date: Date = new Date()): string {
  return isoDayFormatter.format(date);
}

/** Thời điểm 00:00 giờ Việt Nam (UTC+7, không có giờ mùa hè) của ngày yyyy-MM-dd. */
export function vnDayStart(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00+07:00`);
}

/** Cộng / trừ số ngày cho chuỗi yyyy-MM-dd. */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 23:59:59 giờ Việt Nam của ngày yyyy-MM-dd — dùng làm hạn hoàn thành (hết ngày đó mới quá hạn). */
export function vnDayEnd(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999+07:00`);
}

/** Hạn = cuối ngày (giờ VN) của hôm nay + N ngày. */
export function dueAfterDays(days: number): Date {
  return vnDayEnd(addDaysIso(vnIsoDate(), days));
}
