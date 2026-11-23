/**
 * Bunny Stream GIẢ LẬP — CHỈ dùng khi kiểm thử (Việc 31B). Không nằm trong bản build Next.js.
 *   npx tsx e2e/mock-bunny/server.ts          (playwright.config.ts tự chạy kèm app, cổng 3201)
 *
 * Giả lập theo tài liệu Bunny hiện hành (bunny.net/docs, đối chiếu 23/11/2026):
 * - API: POST/GET /library/:lib/videos, GET/DELETE /library/:lib/videos/:guid — header AccessKey (sai → 401), thư viện sai → 404.
 * - TUS: POST/PATCH/HEAD/OPTIONS /tusupload — AuthorizationSignature = SHA256_HEX(libraryId + apiKey + expire + videoId),
 *   hết hạn / sai → 401. Nhận đủ byte → trạng thái 1 Uploaded → 3 Transcoding → 4 Finished (nội dung chứa "LOI" → 5 Error);
 *   "DUR=<giây>" trong nội dung đặt thời lượng (mặc định 20 giây). Xong → POST webhook về app (ký HMAC-SHA256 bằng read-only key).
 * - Embed: GET /embed/:lib/:guid?token&expires — token = SHA256_HEX(tokenKey + guid + expires); sai / hết hạn → 403.
 *   Trang nhúng dùng chính player.js (Receiver) → ready, play, pause, timeupdate {seconds, duration}, ended;
 *   getDuration / getCurrentTime / setCurrentTime. Video giả chạy theo thời gian thực.
 * - Điều khiển cho test: GET /health, GET /__mock/requests, POST /__mock/reset, POST /__mock/config, GET|POST /__mock/videos/:guid.
 *
 * Cấu hình lấy từ biến môi trường (giống .env.test): BUNNY_STREAM_LIBRARY_ID / API_KEY / TOKEN_KEY / READONLY_KEY,
 * MOCK_BUNNY_PORT (3201), MOCK_APP_WEBHOOK_URL (http://localhost:3200/api/bunny/webhook).
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const PORT = Number(process.env.MOCK_BUNNY_PORT ?? 3201);
const LIBRARY_ID = process.env.BUNNY_STREAM_LIBRARY_ID ?? "123456";
const API_KEY = process.env.BUNNY_STREAM_API_KEY ?? "mock-api-key";
const TOKEN_KEY = process.env.BUNNY_STREAM_TOKEN_KEY ?? "mock-token-key";
const READONLY_KEY = process.env.BUNNY_STREAM_READONLY_KEY ?? "";
const WEBHOOK_URL = process.env.MOCK_APP_WEBHOOK_URL ?? "http://localhost:3200/api/bunny/webhook";
const PLAYERJS = fs.readFileSync(path.resolve(__dirname, "../../node_modules/player.js/dist/player-0.1.0.js"), "utf8");

type Video = {
  guid: string;
  title: string;
  status: number;
  length: number;
  encodeProgress: number;
  size: number;
  received: number;
  head: string;
  dateUploaded: string;
};
type LogEntry = { at: number; method: string; path: string; status: number; note?: string };

const videos = new Map<string, Video>();
const log: LogEntry[] = [];
const config = {
  webhook: true,
  /** Khoá / thư viện server CHẤP NHẬN — đổi để giả "sai API key" / "sai Library ID" */
  acceptApiKey: API_KEY,
  acceptLibraryId: LIBRARY_ID,
  /** Thời gian mỗi bước xử lý (ms) */
  stepMs: 700,
  /** Tốc độ phát của trình phát giả (1 = thời gian thực; 2 = như người xem bật 2x) */
  playbackRate: 1,
};

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const now = () => Math.floor(Date.now() / 1000);

function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "Content-Type": typeof body === "string" ? "text/html; charset=utf-8" : "application/json", ...headers });
  res.end(text);
}

function readBody(req: http.IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function videoModel(v: Video) {
  return {
    videoLibraryId: Number(LIBRARY_ID),
    guid: v.guid,
    title: v.title,
    dateUploaded: v.dateUploaded,
    views: 0,
    isPublic: false,
    length: v.status === 4 ? v.length : 0,
    status: v.status,
    framerate: 30,
    width: 1280,
    height: 720,
    availableResolutions: v.status === 4 ? "360p,720p" : null,
    outputCodecs: "x264",
    thumbnailCount: 0,
    encodeProgress: v.encodeProgress,
    storageSize: v.received,
    hasMP4Fallback: false,
    averageWatchTime: 0,
    totalWatchTime: 0,
  };
}

/** Sau khi nhận đủ file: 1 → 3 → 4 (hoặc 5), rồi gửi webhook (nếu bật) — giống Bunny xử lý thật. */
function startProcessing(v: Video) {
  v.status = 1;
  setTimeout(() => {
    if (!videos.has(v.guid)) return;
    v.status = 3;
    v.encodeProgress = 50;
    setTimeout(() => {
      if (!videos.has(v.guid)) return;
      const failed = v.head.includes("LOI");
      v.status = failed ? 5 : 4;
      v.encodeProgress = failed ? 0 : 100;
      const dur = v.head.match(/DUR=(\d+)/);
      v.length = dur ? Number(dur[1]) : 20;
      if (config.webhook) void sendWebhook(v.guid, failed ? 5 : 3);
    }, config.stepMs);
  }, config.stepMs);
}

async function sendWebhook(guid: string, status: number) {
  const body = JSON.stringify({
    IsLiveStreamWebhook: false,
    VideoLibraryId: Number(LIBRARY_ID),
    VideoGuid: guid,
    Status: status,
    EventId: randomUUID(),
    Timestamp: new Date().toISOString(),
  });
  const headers: Record<string, string> = { "Content-Type": "application/json", "X-Forwarded-For": "10.255.0.1" };
  if (READONLY_KEY) {
    headers["X-BunnyStream-Signature-Version"] = "v1";
    headers["X-BunnyStream-Signature-Algorithm"] = "hmac-sha256";
    headers["X-BunnyStream-Signature"] = createHmac("sha256", READONLY_KEY).update(body).digest("hex");
  }
  try {
    const res = await fetch(WEBHOOK_URL, { method: "POST", headers, body });
    log.push({ at: Date.now(), method: "WEBHOOK", path: guid, status: res.status });
  } catch (error) {
    log.push({ at: Date.now(), method: "WEBHOOK", path: guid, status: 0, note: String(error) });
  }
}

const TUS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, PATCH, HEAD, OPTIONS, DELETE",
  "Access-Control-Allow-Headers":
    "Tus-Resumable, Upload-Length, Upload-Metadata, Upload-Offset, Content-Type, AuthorizationSignature, AuthorizationExpire, VideoId, LibraryId, X-Requested-With",
  "Access-Control-Expose-Headers": "Location, Upload-Offset, Upload-Length, Tus-Resumable",
  "Tus-Resumable": "1.0.0",
};

// --- Trang nhúng giả: player.js Receiver + video giả chạy theo thời gian thực ---
function embedPage(v: Video): string {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Mock Bunny Player</title>
<style>body{margin:0;font:14px system-ui;background:#111;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;gap:12px}
button{font:inherit;padding:8px 14px}</style></head>
<body><button id="play" type="button">▶ Phát</button><button id="pause" type="button">⏸ Dừng</button><span id="time">0 / ${v.length}</span>
<script>${PLAYERJS}</script>
<script>
(function(){
  var duration = ${v.length}, rate = ${config.playbackRate}, time = 0, playing = false, timer = null;
  var receiver = new playerjs.Receiver();
  function show(){ document.getElementById('time').textContent = Math.floor(time) + ' / ' + duration; }
  function tick(){
    time = Math.min(duration, time + 0.25 * rate);
    receiver.emit('timeupdate', { seconds: time, duration: duration });
    show();
    if (time >= duration) { stop(); receiver.emit('ended'); }
  }
  function play(){ if (playing) return; playing = true; timer = setInterval(tick, 250); receiver.emit('play'); }
  function stop(){ if (!playing) return; playing = false; clearInterval(timer); receiver.emit('pause'); }
  receiver.on('play', play);
  receiver.on('pause', stop);
  receiver.on('getDuration', function(cb){ cb(duration); });
  receiver.on('getCurrentTime', function(cb){ cb(time); });
  receiver.on('getPaused', function(cb){ cb(!playing); });
  receiver.on('setCurrentTime', function(value){
    time = Math.max(0, Math.min(duration, Number(value) || 0));
    fetch('/__mock/seek/${v.guid}?to=' + time, { method: 'POST' });
    receiver.emit('timeupdate', { seconds: time, duration: duration });
    show();
  });
  document.getElementById('play').onclick = play;
  document.getElementById('pause').onclick = stop;
  /** Test giả lập người xem kéo thanh tua tới giây t */
  window.__mockSeek = function(t){ time = t; receiver.emit('seeked'); receiver.emit('timeupdate', { seconds: time, duration: duration }); show(); };
  window.__mockTime = function(){ return time; };
  receiver.ready();
})();
</script></body></html>`;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const p = url.pathname;
  const record = (status: number, note?: string) => log.push({ at: Date.now(), method: req.method ?? "", path: p, status, note });

  try {
    if (p === "/health") return send(res, 200, { ok: true });

    // ---------------- Điều khiển cho test ----------------
    if (p === "/__mock/requests") return send(res, 200, log);
    if (p === "/__mock/reset" && req.method === "POST") {
      log.length = 0;
      Object.assign(config, { webhook: true, acceptApiKey: API_KEY, acceptLibraryId: LIBRARY_ID, stepMs: 700, playbackRate: 1 });
      return send(res, 200, { ok: true });
    }
    if (p === "/__mock/config" && req.method === "POST") {
      Object.assign(config, JSON.parse((await readBody(req)).toString() || "{}"));
      return send(res, 200, config);
    }
    const seek = p.match(/^\/__mock\/seek\/([0-9a-f-]{36})$/i);
    if (seek) {
      log.push({ at: Date.now(), method: "SEEK", path: seek[1], status: 200, note: url.searchParams.get("to") ?? "" });
      return send(res, 200, { ok: true }, { "Access-Control-Allow-Origin": "*" });
    }
    const mv = p.match(/^\/__mock\/videos\/([0-9a-f-]{36})$/i);
    if (mv) {
      const v = videos.get(mv[1].toLowerCase());
      if (req.method === "POST") {
        const patch = JSON.parse((await readBody(req)).toString() || "{}") as Partial<Video>;
        if (!v) return send(res, 404, { ok: false });
        Object.assign(v, patch);
        return send(res, 200, videoModel(v));
      }
      return v ? send(res, 200, videoModel(v)) : send(res, 404, { ok: false });
    }

    // ---------------- TUS ----------------
    if (p.startsWith("/tusupload")) {
      if (req.method === "OPTIONS") {
        res.writeHead(204, TUS_HEADERS);
        return res.end();
      }
      if (req.method === "POST" && p === "/tusupload") {
        const videoId = String(req.headers["videoid"] ?? "").toLowerCase();
        const expire = Number(req.headers["authorizationexpire"]);
        const signature = String(req.headers["authorizationsignature"] ?? "");
        const lib = String(req.headers["libraryid"] ?? "");
        const v = videos.get(videoId);
        const expected = sha256(`${lib}${API_KEY}${expire}${videoId}`);
        if (!v || lib !== LIBRARY_ID || !Number.isFinite(expire) || expire < now() || signature !== expected) {
          record(401, "sai chữ ký / hết hạn / video không tồn tại");
          res.writeHead(401, TUS_HEADERS);
          return res.end("Unauthorized");
        }
        v.size = Number(req.headers["upload-length"] ?? 0);
        v.received = 0;
        record(201);
        res.writeHead(201, { ...TUS_HEADERS, Location: `http://localhost:${PORT}/tusupload/${videoId}` });
        return res.end();
      }
      const id = p.split("/")[2]?.toLowerCase() ?? "";
      const v = videos.get(id);
      if (!v) {
        record(404);
        res.writeHead(404, TUS_HEADERS);
        return res.end();
      }
      if (req.method === "HEAD") {
        res.writeHead(200, { ...TUS_HEADERS, "Upload-Offset": String(v.received), "Upload-Length": String(v.size), "Cache-Control": "no-store" });
        return res.end();
      }
      if (req.method === "PATCH") {
        const chunk = await readBody(req);
        if (v.head.length < 65_536) v.head += chunk.toString("latin1").slice(0, 65_536 - v.head.length);
        v.received += chunk.length;
        record(204, `${v.received}/${v.size}`);
        if (v.received >= v.size) startProcessing(v);
        res.writeHead(204, { ...TUS_HEADERS, "Upload-Offset": String(v.received) });
        return res.end();
      }
      res.writeHead(405, TUS_HEADERS);
      return res.end();
    }

    // ---------------- Embed ----------------
    const embed = p.match(/^\/embed\/(\d+)\/([0-9a-f-]{36})$/i);
    if (embed) {
      const [, lib, guid] = embed;
      const token = url.searchParams.get("token") ?? "";
      const expires = Number(url.searchParams.get("expires"));
      const v = videos.get(guid.toLowerCase());
      if (lib !== LIBRARY_ID || !Number.isFinite(expires) || expires < now() || token !== sha256(`${TOKEN_KEY}${guid}${expires}`)) {
        record(403, "token sai / hết hạn");
        return send(res, 403, "<!doctype html><p>403 — token không hợp lệ hoặc đã hết hạn</p>");
      }
      if (!v || v.status !== 4) {
        record(404);
        return send(res, 404, "<!doctype html><p>Video không tồn tại hoặc chưa xử lý xong</p>");
      }
      record(200);
      return send(res, 200, embedPage(v));
    }

    // ---------------- API thư viện ----------------
    const api = p.match(/^\/library\/([^/]+)\/videos(?:\/([^/]+))?$/);
    if (api) {
      const [, lib, guidRaw] = api;
      if (req.headers["accesskey"] !== config.acceptApiKey) {
        record(401);
        return send(res, 401, { success: false, message: "Authentication failed", statusCode: 401 });
      }
      if (lib !== config.acceptLibraryId) {
        record(404);
        return send(res, 404, { success: false, message: "Video library not found", statusCode: 404 });
      }
      if (!guidRaw) {
        if (req.method === "POST") {
          const body = JSON.parse((await readBody(req)).toString() || "{}") as { title?: string };
          if (!body.title) {
            record(400);
            return send(res, 400, { success: false, message: "Title is required", statusCode: 400 });
          }
          const v: Video = { guid: randomUUID(), title: body.title, status: 0, length: 0, encodeProgress: 0, size: 0, received: 0, head: "", dateUploaded: new Date().toISOString() };
          videos.set(v.guid, v);
          record(200, v.guid);
          return send(res, 200, videoModel(v));
        }
        const items = [...videos.values()];
        const perPage = Math.max(10, Math.min(1000, Number(url.searchParams.get("itemsPerPage") ?? 100)));
        record(200);
        return send(res, 200, { totalItems: items.length, currentPage: 1, itemsPerPage: perPage, items: items.slice(0, perPage).map(videoModel) });
      }
      const guid = guidRaw.toLowerCase();
      const v = videos.get(guid);
      if (req.method === "DELETE") {
        if (!v) {
          record(404, guid);
          return send(res, 404, { success: false, message: "Video not found", statusCode: 404 });
        }
        videos.delete(guid);
        record(200, guid);
        return send(res, 200, { success: true, message: "OK", statusCode: 200 });
      }
      if (!v) {
        record(404, guid);
        return res.writeHead(404).end();
      }
      record(200, guid);
      return send(res, 200, videoModel(v));
    }

    record(404);
    return send(res, 404, { success: false, message: "Not found", statusCode: 404 });
  } catch (error) {
    record(500, String(error));
    return send(res, 500, { success: false, message: String(error), statusCode: 500 });
  }
});

server.listen(PORT, () => console.log(`[mock-bunny] http://localhost:${PORT} (thư viện ${LIBRARY_ID})`));
