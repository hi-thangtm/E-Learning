/**
 * Lark GIẢ LẬP — CHỈ dùng khi kiểm thử (Việc L1). Không nằm trong bản build Next.js.
 *   npx tsx e2e/mock-lark/server.ts          (playwright.config.ts tự chạy kèm app, cổng 3202)
 *
 * Giả lập theo tài liệu contact v3 (open.larksuite.com/document) + đường gọi của @larksuiteoapi/node-sdk:
 * - POST /open-apis/auth/v3/tenant_access_token/internal {app_id, app_secret} → { code: 0, tenant_access_token, expire }; sai → code 10014.
 * - GET  /open-apis/contact/v3/departments/:id/children  (page_size ≤ 50, page_token) — cần Bearer token hợp lệ.
 * - GET  /open-apis/contact/v3/users/find_by_department?department_id=…  — người TRỰC TIẾP trong phòng.
 * - Điều khiển cho test: GET /health, POST /__mock/state { departments, users }, POST /__mock/reset, GET /__mock/requests,
 *   POST /__mock/rate-limit { count } (n lần gọi tiếp theo trả HTTP 429 — kiểm thử thử lại).
 *
 * Cấu hình từ biến môi trường (giống .env.test): LARK_APP_ID, LARK_APP_SECRET, MOCK_LARK_PORT (3202).
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_LARK_PORT ?? 3202);
const APP_ID = process.env.LARK_APP_ID ?? "cli_mock";
const APP_SECRET = process.env.LARK_APP_SECRET ?? "mock-secret";
const TOKEN = "t-mock-tenant-token";

type MockDept = { open_department_id: string; name: string; parent_department_id: string; leader_user_id?: string };
type MockUser = {
  user_id: string;
  name: string;
  employee_no?: string;
  email?: string;
  enterprise_email?: string;
  mobile?: string;
  department_ids: string[];
  primary?: string;
  join_time?: number;
  resigned?: boolean;
  frozen?: boolean;
};

let state: { departments: MockDept[]; users: MockUser[] } = { departments: [], users: [] };
let rateLimitLeft = 0;
const requests: { method: string; path: string }[] = [];

function send(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

function page<T>(items: T[], url: URL) {
  const size = Math.min(50, Number(url.searchParams.get("page_size") ?? 10) || 10);
  const start = Number(url.searchParams.get("page_token") ?? 0) || 0;
  const slice = items.slice(start, start + size);
  const hasMore = start + size < items.length;
  return { has_more: hasMore, ...(hasMore && { page_token: String(start + size) }), items: slice };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const path = url.pathname;
  if (!path.startsWith("/__mock") && path !== "/health") requests.push({ method: req.method ?? "GET", path });

  try {
    if (path === "/health") return send(res, 200, { ok: true });
    if (path === "/__mock/state" && req.method === "POST") {
      const body = await readJson(req);
      state = { departments: (body.departments as MockDept[]) ?? [], users: (body.users as MockUser[]) ?? [] };
      return send(res, 200, { ok: true });
    }
    if (path === "/__mock/reset" && req.method === "POST") {
      state = { departments: [], users: [] };
      rateLimitLeft = 0;
      requests.length = 0;
      return send(res, 200, { ok: true });
    }
    if (path === "/__mock/requests") return send(res, 200, requests);
    if (path === "/__mock/rate-limit" && req.method === "POST") {
      rateLimitLeft = Number((await readJson(req)).count ?? 1);
      return send(res, 200, { ok: true });
    }

    if (path === "/open-apis/auth/v3/tenant_access_token/internal" && req.method === "POST") {
      const body = await readJson(req);
      if (body.app_id !== APP_ID || body.app_secret !== APP_SECRET) return send(res, 200, { code: 10014, msg: "app secret invalid" });
      return send(res, 200, { code: 0, msg: "ok", tenant_access_token: TOKEN, expire: 7200 });
    }

    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { code: 99991663, msg: "Invalid access token for authorization." });
    if (rateLimitLeft > 0) {
      rateLimitLeft--;
      res.setHeader("x-ogw-ratelimit-reset", "1");
      return send(res, 429, { code: 99991400, msg: "request trigger frequency limit" });
    }

    const children = path.match(/^\/open-apis\/contact\/v3\/departments\/([^/]+)\/children$/);
    if (children && req.method === "GET") {
      const parent = decodeURIComponent(children[1]);
      const items = state.departments
        .filter((d) => d.parent_department_id === parent)
        .map((d) => ({ name: d.name, open_department_id: d.open_department_id, parent_department_id: d.parent_department_id, leader_user_id: d.leader_user_id, status: { is_deleted: false } }));
      return send(res, 200, { code: 0, msg: "success", data: page(items, url) });
    }

    if (path === "/open-apis/contact/v3/users/find_by_department" && req.method === "GET") {
      const dept = url.searchParams.get("department_id") ?? "";
      const items = state.users
        .filter((u) => u.department_ids.includes(dept))
        .map((u) => ({
          user_id: u.user_id,
          open_id: `ou_${u.user_id}`,
          name: u.name,
          employee_no: u.employee_no,
          email: u.email,
          enterprise_email: u.enterprise_email,
          mobile: u.mobile,
          department_ids: u.department_ids,
          orders: u.department_ids.map((id) => ({ department_id: id, is_primary_dept: id === (u.primary ?? u.department_ids[0]) })),
          join_time: u.join_time,
          status: { is_resigned: !!u.resigned, is_frozen: !!u.frozen, is_activated: !u.resigned, is_exited: false, is_unjoin: false },
        }));
      return send(res, 200, { code: 0, msg: "success", data: page(items, url) });
    }

    return send(res, 404, { code: 404, msg: `Không có ${req.method} ${path}` });
  } catch (e) {
    return send(res, 500, { code: 500, msg: e instanceof Error ? e.message : "lỗi" });
  }
});

server.listen(PORT, () => console.log(`Lark giả lập: http://localhost:${PORT}`));
