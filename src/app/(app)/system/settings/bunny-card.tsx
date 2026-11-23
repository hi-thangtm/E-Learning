import { CircleAlert, CircleCheck, CircleDashed, CircleHelp } from "lucide-react";
import { lastBunnyConnection, maskedBunnyConfig, type BunnyConnectionResult } from "@/lib/bunny";
import { formatDateTime, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BunnyCopyWebhook, BunnyTestButton } from "./bunny-controls";

/** Nhãn + màu của kết quả kiểm tra kết nối */
export function bunnyStatusView(result: BunnyConnectionResult | null): { label: string; tone: "success" | "destructive" | "muted" | "warning" } {
  if (!result) return { label: "Chưa kiểm tra", tone: "warning" };
  switch (result.status) {
    case "ok":
      return { label: `Đã kết nối · ${formatNumber(result.videoCount)} video trong thư viện`, tone: "success" };
    case "not_configured":
      return { label: "Chưa cấu hình", tone: "muted" };
    case "bad_key":
      return { label: "Lỗi: sai API key", tone: "destructive" };
    case "bad_library":
      return { label: "Lỗi: sai Library ID", tone: "destructive" };
    case "unreachable":
      return { label: "Lỗi: không gọi được Bunny", tone: "destructive" };
  }
}

const TONE = {
  success: "bg-success/16 text-success",
  destructive: "bg-destructive/16 text-destructive",
  warning: "bg-warning/16 text-warning",
  muted: "bg-muted text-muted-foreground",
} as const;

const ICON = { success: CircleCheck, destructive: CircleAlert, warning: CircleHelp, muted: CircleDashed } as const;

const CHECKLIST = [
  "Security › bật Token Authentication cho trình phát nhúng (embed view) — chép “Token authentication key” vào BUNNY_STREAM_TOKEN_KEY.",
  "Security › Allowed domains: chỉ tên miền của hệ thống (không có https://).",
  "Security › bật Block Direct URL File Access (chặn mở thẳng file video / ảnh).",
  "Encoding › TẮT Enable MP4 Fallback và Enable Early-Play (không cho tải / lộ file gốc).",
  "API › Webhook URL: dán địa chỉ webhook bên dưới.",
];

/**
 * Thẻ "Video Bunny Stream" trên /system/settings (trang đã requireRole GROUP_ADMIN). Cấu hình đọc từ .env — trang này chỉ HIỂN THỊ:
 * khoá chỉ còn "••••" + 4 ký tự cuối, không bao giờ đưa khoá thật vào HTML.
 */
export function BunnyCard() {
  const config = maskedBunnyConfig();
  const last = lastBunnyConnection();
  const view = config.configured ? bunnyStatusView(last?.result ?? null) : bunnyStatusView({ status: "not_configured" });
  const Icon = ICON[view.tone];
  const appUrl = (process.env.APP_URL || process.env.AUTH_URL || "").replace(/\/+$/, "");
  const webhookUrl = appUrl ? `${appUrl}/api/bunny/webhook` : "/api/bunny/webhook";

  const rows: [string, string][] = [
    ["Library ID", config.libraryId ?? "—"],
    ["API key", config.apiKey ?? "Chưa điền"],
    ["Token key (xem video)", config.tokenKey ?? "Chưa điền"],
    ["Chữ ký webhook (Read-Only key)", config.readonlyKey ? `Bật · ${config.readonlyKey}` : "Tắt (tuỳ chọn)"],
  ];

  return (
    <section className="rounded-md bg-card shadow-md" aria-labelledby="bunny-title">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-6">
        <div>
          <h2 id="bunny-title" className="text-lg font-medium text-foreground">
            Video Bunny Stream
          </h2>
          <p className="text-[13px] text-muted-foreground">
            Khoá đọc từ file .env của máy chủ (BUNNY_STREAM_LIBRARY_ID / API_KEY / TOKEN_KEY). Đổi khoá: sửa .env rồi khởi động lại. Hướng dẫn: docs/bunny-setup.md.
          </p>
        </div>
        {config.configured && <BunnyTestButton />}
      </header>

      <div className="grid gap-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-[15px] font-medium", TONE[view.tone])} data-testid="bunny-status">
            <Icon className="size-[18px]" />
            {view.label}
          </span>
          {last && config.configured && <span className="text-[13px] text-muted-foreground">Kiểm tra lúc {formatDateTime(last.at)}</span>}
          {config.customEndpoints && (
            <span className="text-[13px] text-warning">Đang trỏ sang địa chỉ Bunny KIỂM THỬ (BUNNY_API_BASE / TUS / EMBED_HOST) — để trống khi chạy thật.</span>
          )}
        </div>

        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 text-[15px] md:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-0.5">
              <dt className="text-[13px] text-muted-foreground">{label}</dt>
              <dd className="font-mono text-foreground">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="grid gap-1.5">
          <p className="text-[13px] text-muted-foreground">Địa chỉ webhook (dán vào Bunny › thư viện › API › Webhook URL)</p>
          <BunnyCopyWebhook url={webhookUrl} />
        </div>

        <div className="grid gap-2">
          <p className="text-[15px] font-medium text-foreground">Việc cần bật trong Bunny</p>
          <ul className="grid list-disc gap-1 pl-5 text-[15px] text-muted-foreground">
            {CHECKLIST.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
