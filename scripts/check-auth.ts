/**
 * Kiểm tra quyền tự động (Việc 29A):   npm run check:auth
 *
 * Quét mọi file "use server" trong src/ (không chỉ src/app — VD src/components/quick-search/actions.ts) và mọi route.ts trong src/app. Mỗi hàm được export (server action / GET, POST...) phải gọi
 * requireUser / requireRole / getCurrentUser / auth() — trực tiếp, hoặc qua hàm CÙNG FILE đã được bảo vệ
 * (VD action gọi `loadEditable()` mà `loadEditable` gọi `requireRole`). Ngoại lệ phải nằm trong EXCEPTIONS kèm lý do.
 * Có vi phạm → in danh sách và thoát mã 1.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "..");
const SRC_DIR = path.join(ROOT, "src");
const APP_DIR = path.join(SRC_DIR, "app");
const GUARDS = new Set(["requireUser", "requireRole", "getCurrentUser", "auth"]);
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);

/** Ngoại lệ: đường dẫn file (tính từ thư mục gốc, dấu /) → lý do. */
const EXCEPTIONS: Record<string, string> = {
  "src/app/api/auth/[...nextauth]/route.ts": "Auth.js — chính là điểm đăng nhập / đăng xuất.",
  "src/app/api/branding/logo/route.ts": "Logo công khai (trang đăng nhập, /verify cần khi chưa đăng nhập); chỉ trả đúng file trong cài đặt.",
  "src/app/api/jobs/daily/route.ts": "Bộ lập lịch gọi bằng CRON_SECRET (Bearer, so sánh timingSafeEqual), không có phiên người dùng.",
  "src/app/api/bunny/webhook/route.ts":
    "Bunny Stream gọi khi video đổi trạng thái, không có phiên. Chỉ đọc VideoGuid rồi HỎI LẠI Bunny bằng API key (không tin Status trong body); kiểm chữ ký HMAC khi có BUNNY_STREAM_READONLY_KEY; rate limit theo IP; luôn trả 200.",
  "src/app/login/actions.ts": "Đăng nhập — người dùng chưa có phiên; giới hạn tần suất trong src/auth.ts.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function hasUseServerDirective(sf: ts.SourceFile): boolean {
  for (const stmt of sf.statements) {
    if (ts.isExpressionStatement(stmt) && ts.isStringLiteral(stmt.expression)) {
      if (stmt.expression.text === "use server") return true;
      continue;
    }
    break;
  }
  return false;
}

const isExported = (node: ts.Node) =>
  ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

type Fn = { name: string; body: ts.Node; exported: boolean; line: number };

/** Hàm cấp cao nhất của file: function declaration + const x = (async) arrow / function. */
function topLevelFunctions(sf: ts.SourceFile): Fn[] {
  const fns: Fn[] = [];
  const line = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  for (const stmt of sf.statements) {
    if (ts.isFunctionDeclaration(stmt) && stmt.name && stmt.body) {
      fns.push({ name: stmt.name.text, body: stmt.body, exported: isExported(stmt), line: line(stmt) });
    } else if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.initializer && (ts.isArrowFunction(d.initializer) || ts.isFunctionExpression(d.initializer))) {
          fns.push({ name: d.name.text, body: d.initializer.body, exported: isExported(stmt), line: line(stmt) });
        }
      }
    }
  }
  return fns;
}

/** Tên các hàm được gọi trong `node` (chỉ gọi trực tiếp bằng tên: foo(...)). */
function calledNames(node: ts.Node): Set<string> {
  const names = new Set<string>();
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression)) names.add(n.expression.text);
    ts.forEachChild(n, visit);
  };
  visit(node);
  return names;
}

type Violation = { file: string; fn: string; line: number };

const files = walk(SRC_DIR);
const violations: Violation[] = [];
const exceptionsUsed: string[] = [];
let checked = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).split(path.sep).join("/");
  const isRoute = path.basename(file) === "route.ts" && file.startsWith(APP_DIR + path.sep);
  const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const isServerActions = hasUseServerDirective(sf);
  if (!isRoute && !isServerActions) continue;

  if (EXCEPTIONS[rel]) {
    exceptionsUsed.push(rel);
    continue;
  }

  const fns = topLevelFunctions(sf);
  // Lan truyền: hàm cục bộ được bảo vệ nếu gọi guard hoặc gọi hàm cục bộ đã được bảo vệ (tới điểm cố định)
  const calls = new Map(fns.map((f) => [f.name, calledNames(f.body)]));
  const guarded = new Set<string>();
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of fns) {
      if (guarded.has(f.name)) continue;
      const c = calls.get(f.name)!;
      if ([...c].some((n) => GUARDS.has(n) || guarded.has(n))) {
        guarded.add(f.name);
        changed = true;
      }
    }
  }

  const entries = fns.filter((f) => f.exported && (isServerActions || HTTP_METHODS.has(f.name)));
  // route.ts xuất kiểu khác (VD `export const { GET } = handlers`) → không phân tích được → coi là vi phạm để người viết xem lại
  if (isRoute && entries.length === 0) violations.push({ file: rel, fn: "(không tìm thấy GET/POST dạng hàm)", line: 1 });
  for (const f of entries) {
    checked++;
    if (!guarded.has(f.name)) violations.push({ file: rel, fn: f.name, line: f.line });
  }
}

console.log(`Đã kiểm tra ${checked} hàm (server action trong src/ + route handler trong src/app).`);
console.log(`Ngoại lệ (${exceptionsUsed.length}):`);
for (const rel of exceptionsUsed) console.log(`  - ${rel}: ${EXCEPTIONS[rel]}`);
for (const rel of Object.keys(EXCEPTIONS)) {
  if (!exceptionsUsed.includes(rel)) console.log(`  ! Ngoại lệ không còn file: ${rel} — xoá khỏi danh sách.`);
}

if (violations.length > 0) {
  console.error(`\n✗ ${violations.length} hàm KHÔNG kiểm tra đăng nhập / quyền:`);
  for (const v of violations) console.error(`  ${v.file}:${v.line}  ${v.fn}`);
  process.exit(1);
}
console.log("\n✓ Mọi server action / route handler đều kiểm tra đăng nhập / quyền.");
