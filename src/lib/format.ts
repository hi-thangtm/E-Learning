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

/** Số có dấu chấm ngăn cách hàng nghìn (1.234). */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}
