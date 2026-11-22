/* eslint-disable @typescript-eslint/no-require-imports -- file CommonJS nạp bằng tsx --require, không dùng được import */
/**
 * Chỉ dùng cho script chạy bằng tsx (seed, job:daily, bench...): biến gói "server-only" thành module rỗng.
 * Trong Next.js, "server-only" báo lỗi khi file server bị nạp vào trình duyệt; script Node thì luôn chạy ở server nên an toàn.
 * Cách dùng: tsx --require ./scripts/allow-server-only.cjs <script>
 */
const Module = require("node:module");
const resolved = require.resolve("server-only");
const stub = new Module(resolved);
stub.filename = resolved;
stub.loaded = true;
stub.exports = {};
require.cache[resolved] = stub;
