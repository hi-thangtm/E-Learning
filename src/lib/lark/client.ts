import "server-only";
import { createHash } from "node:crypto";
import * as lark from "@larksuiteoapi/node-sdk";
import { prisma } from "@/lib/db";
import { openSecret, sealSecret } from "@/lib/secret-box";

/**
 * Kết nối Lark (Việc L1) — app tự xây (self-build) dùng tenant_access_token, SDK chính thức @larksuiteoapi/node-sdk
 * (repo larksuite/node-sdk). SDK tự lấy + cache token.
 *
 * Cấu hình (ưu tiên từ trên xuống):
 *   1. Nhập trên giao diện Hệ thống › Kết nối Lark → system_settings "LARK_CREDENTIALS" { appId, domain, secret (mã hoá AES-256-GCM, khoá từ AUTH_SECRET) }.
 *   2. Biến môi trường LARK_APP_ID, LARK_APP_SECRET, LARK_DOMAIN (larksuite | feishu | URL đầy đủ — URL dùng cho Lark giả lập khi kiểm thử).
 *
 * An toàn: App Secret KHÔNG bao giờ gửi về trình duyệt / log. SDK mặc định log nguyên lỗi axios khi lấy token thất bại (lỗi đó chứa cả
 * request body có app_secret) → client dùng logger riêng chỉ in chuỗi thông điệp, bỏ mọi object.
 */

export const LARK_DOMAINS = { larksuite: "https://open.larksuite.com", feishu: "https://open.feishu.cn" } as const;
export type LarkDomainKey = keyof typeof LARK_DOMAINS;
const SETTING_KEY = "LARK_CREDENTIALS";
const SECRET_PURPOSE = "lark-app-secret";

type LarkConfig = { appId: string; appSecret: string; domain: string; source: "ui" | "env" };
type StoredCredentials = { appId: string; domain: LarkDomainKey; secret: string };

function domainUrl(raw: string): string {
  const v = raw.trim().replace(/\/+$/, "");
  const key = v.toLowerCase() === "lark" ? "larksuite" : v.toLowerCase();
  if (key in LARK_DOMAINS) return LARK_DOMAINS[key as LarkDomainKey];
  return /^https?:\/\//.test(v) ? v : LARK_DOMAINS.larksuite;
}

async function storedCredentials(): Promise<StoredCredentials | null> {
  const row = await prisma.systemSetting.findUnique({ where: { key: SETTING_KEY }, select: { value: true } });
  const v = row?.value as Partial<StoredCredentials> | null | undefined;
  if (!v || typeof v.appId !== "string" || typeof v.secret !== "string") return null;
  return { appId: v.appId, domain: v.domain === "feishu" ? "feishu" : "larksuite", secret: v.secret };
}

function envConfig(): LarkConfig | null {
  const appId = process.env.LARK_APP_ID?.trim();
  const appSecret = process.env.LARK_APP_SECRET?.trim();
  if (!appId || !appSecret) return null;
  return { appId, appSecret, domain: domainUrl(process.env.LARK_DOMAIN || "larksuite"), source: "env" };
}

/** Cấu hình đang dùng: giao diện trước, .env sau. Secret trên giao diện không giải mã được (đổi AUTH_SECRET) → coi như chưa cấu hình. */
async function larkConfig(): Promise<LarkConfig | null> {
  const stored = await storedCredentials();
  if (stored) {
    const appSecret = openSecret(stored.secret, SECRET_PURPOSE);
    return appSecret ? { appId: stored.appId, appSecret, domain: LARK_DOMAINS[stored.domain], source: "ui" } : null;
  }
  return envConfig();
}

export async function isLarkConfigured(): Promise<boolean> {
  return (await larkConfig()) !== null;
}

export type LarkSettingsView = {
  source: "ui" | "env" | null;
  appId: string | null;
  domain: LarkDomainKey | "custom";
  domainUrl: string | null;
  /** “••••” + 4 ký tự cuối — KHÔNG có secret thật */
  secretHint: string | null;
  /** Đã lưu trên giao diện nhưng không giải mã được (AUTH_SECRET đã đổi) → cần nhập lại */
  secretUnreadable: boolean;
};

/** Cho trang quản trị: App ID (hiện đủ — không phải bí mật), máy chủ, gợi ý 4 ký tự cuối của secret. */
export async function getLarkSettingsView(): Promise<LarkSettingsView> {
  const stored = await storedCredentials();
  if (stored) {
    const secret = openSecret(stored.secret, SECRET_PURPOSE);
    return { source: "ui", appId: stored.appId, domain: stored.domain, domainUrl: LARK_DOMAINS[stored.domain], secretHint: secret ? `••••${secret.slice(-4)}` : null, secretUnreadable: !secret };
  }
  const env = envConfig();
  if (!env) return { source: null, appId: null, domain: "larksuite", domainUrl: null, secretHint: null, secretUnreadable: false };
  const key = (Object.keys(LARK_DOMAINS) as LarkDomainKey[]).find((k) => LARK_DOMAINS[k] === env.domain);
  return { source: "env", appId: env.appId, domain: key ?? "custom", domainUrl: env.domain, secretHint: `••••${env.appSecret.slice(-4)}`, secretUnreadable: false };
}

/** Lưu cấu hình nhập trên giao diện. secret = null → giữ secret đã lưu (lỗi nếu chưa có). */
export async function saveLarkCredentials(input: { appId: string; domain: LarkDomainKey; secret: string | null }): Promise<{ ok: true } | { ok: false; message: string }> {
  let sealed: string;
  if (input.secret) sealed = sealSecret(input.secret, SECRET_PURPOSE);
  else {
    const stored = await storedCredentials();
    if (!stored || !openSecret(stored.secret, SECRET_PURPOSE)) return { ok: false, message: "Vui lòng nhập App Secret." };
    sealed = stored.secret;
  }
  const value = { appId: input.appId, domain: input.domain, secret: sealed };
  await prisma.systemSetting.upsert({ where: { key: SETTING_KEY }, create: { key: SETTING_KEY, value }, update: { value } });
  cached = null;
  return { ok: true };
}

/** Xoá cấu hình trên giao diện (quay về .env nếu có). */
export async function clearLarkCredentials(): Promise<void> {
  await prisma.systemSetting.deleteMany({ where: { key: SETTING_KEY } });
  cached = null;
}

/** Secret đang dùng (để che nếu lọt vào chuỗi log) */
let activeSecret: string | null = null;

/** Chỉ giữ chuỗi; Error → message; bỏ mọi object (có thể chứa config / body có secret). Che luôn secret nếu lọt vào chuỗi. */
function safeText(args: unknown[]): string {
  const secrets = [activeSecret, process.env.LARK_APP_SECRET?.trim()].filter((x): x is string => !!x);
  let text = args
    .map((a) => (typeof a === "string" ? a : a instanceof Error ? a.message : typeof a === "number" ? String(a) : ""))
    .filter(Boolean)
    .join(" ");
  for (const s of secrets) text = text.split(s).join("••••");
  return text;
}
const safeLogger = {
  error: (...msg: unknown[]) => console.error("[lark]", safeText(msg)),
  warn: (...msg: unknown[]) => console.warn("[lark]", safeText(msg)),
  info: () => {},
  debug: () => {},
  trace: () => {},
};

let cached: { key: string; client: lark.Client } | null = null;

export async function getLarkClient(): Promise<lark.Client> {
  const c = await larkConfig();
  if (!c) throw new LarkNotConfiguredError();
  // Khoá cache gồm hash secret → đổi secret trên giao diện là tạo client mới (token cũ bỏ)
  const key = `${c.appId}|${c.domain}|${createHash("sha256").update(c.appSecret).digest("hex")}`;
  activeSecret = c.appSecret;
  if (cached?.key !== key) {
    cached = {
      key,
      client: new lark.Client({
        appId: c.appId,
        appSecret: c.appSecret,
        appType: lark.AppType.SelfBuild,
        domain: c.domain,
        logger: safeLogger,
        loggerLevel: lark.LoggerLevel.error,
      }),
    };
  }
  return cached.client;
}

// ---------------------------------------------------------------------------------------------
// Lỗi + thử lại khi bị giới hạn tần suất

export class LarkNotConfiguredError extends Error {
  constructor() {
    super("Chưa cấu hình Lark — nhập App ID / App Secret ở Hệ thống › Kết nối Lark.");
  }
}

export class LarkApiError extends Error {
  constructor(
    readonly label: string,
    readonly code: number | null,
    readonly httpStatus: number | null,
    msg: string,
  ) {
    super(`Lark ${label}: ${code !== null ? `mã ${code} — ` : ""}${msg}`);
  }
}

/** Mã lỗi “gọi quá nhiều” của Lark (frequency control) */
const RATE_LIMIT_CODES = new Set([99991400, 99991663]);
const MAX_RETRIES = 5;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type LarkResponse = { code?: number; msg?: string };
type AxiosLikeError = { response?: { status?: number; data?: LarkResponse; headers?: Record<string, unknown> }; message?: string; code?: string };

function retryDelayMs(attempt: number, headers?: Record<string, unknown>): number {
  const reset = Number(headers?.["x-ogw-ratelimit-reset"]);
  if (Number.isFinite(reset) && reset > 0 && reset <= 60) return reset * 1000;
  return Math.min(8000, 1000 * 2 ** attempt);
}

/**
 * Gọi 1 API Lark: thử lại khi bị giới hạn tần suất (HTTP 429 / mã 99991400…), mã ≠ 0 → LarkApiError.
 * `label` mô tả lời gọi để log (không chứa dữ liệu nhạy cảm).
 */
export async function larkCall<T extends LarkResponse>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fn();
      if (res?.code && res.code !== 0) {
        if (RATE_LIMIT_CODES.has(res.code) && attempt < MAX_RETRIES) {
          await sleep(retryDelayMs(attempt));
          continue;
        }
        throw new LarkApiError(label, res.code, null, res.msg ?? "lỗi không rõ");
      }
      return res;
    } catch (e) {
      if (e instanceof LarkApiError) {
        console.error(`[lark] ${e.message}`);
        throw e;
      }
      const err = e as AxiosLikeError;
      const status = err.response?.status ?? null;
      const code = err.response?.data?.code ?? null;
      const limited = status === 429 || (code !== null && RATE_LIMIT_CODES.has(code));
      if (limited && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(attempt, err.response?.headers));
        continue;
      }
      const msg = err.response?.data?.msg ?? safeText([e]) ?? "không gọi được Lark";
      const wrapped = new LarkApiError(label, code, status, msg || "không gọi được Lark");
      console.error(`[lark] ${wrapped.message}${status ? ` (HTTP ${status})` : ""}`);
      throw wrapped;
    }
  }
}

/** Duyệt mọi trang (page_token / has_more), page_size tối đa 50 theo tài liệu Lark. */
export async function larkPaginate<I>(
  label: string,
  fetchPage: (pageToken: string | undefined) => Promise<{ code?: number; msg?: string; data?: { items?: I[]; has_more?: boolean; page_token?: string } }>,
): Promise<I[]> {
  const out: I[] = [];
  let token: string | undefined;
  for (let page = 0; page < 10_000; page++) {
    const res = await larkCall(label, () => fetchPage(token));
    out.push(...(res.data?.items ?? []));
    if (!res.data?.has_more || !res.data.page_token) break;
    token = res.data.page_token;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Kiểm tra kết nối

export type LarkConnectionResult =
  | { status: "ok"; topDepartments: number }
  | { status: "not_configured" }
  | { status: "bad_credentials"; message: string }
  | { status: "no_permission"; message: string }
  | { status: "unreachable"; message: string };

/** Lấy tenant token + đọc phòng ban con của phòng gốc "0" (cần phạm vi danh bạ Toàn bộ thành viên). */
export async function testLarkConnection(): Promise<LarkConnectionResult> {
  if (!(await isLarkConfigured())) return { status: "not_configured" };
  const client = await getLarkClient();
  try {
    const res = await larkCall("kiểm tra kết nối", () =>
      client.contact.department.children({
        path: { department_id: "0" },
        params: { department_id_type: "open_department_id", page_size: 50 },
      }),
    );
    return { status: "ok", topDepartments: res.data?.items?.length ?? 0 };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Lỗi không rõ";
    if (e instanceof LarkApiError) {
      // Lỗi lấy token (sai App ID / Secret) không có mã HTTP; 403 / 40004 / 99991672… = thiếu quyền / phạm vi
      if (/tenant_access_token|app[ _]?secret|app[ _]?id/i.test(message) || e.code === 10014 || e.code === 10003) {
        return { status: "bad_credentials", message };
      }
      if (e.httpStatus === 403 || e.code === 40004 || e.code === 99991672 || e.code === 99991679) return { status: "no_permission", message };
      if (e.code !== null) return { status: "no_permission", message };
    }
    return { status: "unreachable", message };
  }
}
