/**
 * Chạy 1 lần khi máy chủ Next.js khởi động (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation.md).
 * Khởi động bộ gửi thông báo qua Lark chạy nền (Việc L2 — src/lib/lark/notify.ts). Chỉ runtime Node.js.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startLarkDispatcher } = await import("@/lib/lark/notify");
  startLarkDispatcher();
}
