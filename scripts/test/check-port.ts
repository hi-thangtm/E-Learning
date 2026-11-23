import { execSync } from "node:child_process";
import net from "node:net";
import { MOCK_BUNNY_PORT, TEST_PORT } from "./common";

/**
 * Chạy TRƯỚC seed / build của test:e2e, test:e2e:ui: dừng sớm nếu cổng test (app 3200, Bunny giả lập 3201) đang bị chiếm
 * (thường do cửa sổ `npm run test:e2e:ui` còn mở — nó giữ server test cho tới khi đóng).
 * Không dùng reuseExistingServer: server lạ ở cổng này có thể nối tới database khác → test ghi nhầm dữ liệu.
 */
function check(port: number): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (error: NodeJS.ErrnoException) => {
      if (error.code !== "EADDRINUSE") return reject(error);
      let owner = "";
      try {
        const pid = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN`, { encoding: "utf8" }).trim().split("\n")[0];
        if (pid) owner = execSync(`ps -o command= -p ${pid}`, { encoding: "utf8" }).trim();
      } catch {
        // Không có lsof (Windows) → bỏ qua phần tên tiến trình
      }
      console.error(`\n✗ Cổng ${port} đang được dùng${owner ? ` bởi: ${owner}` : ""}.`);
      console.error("  Thường do cửa sổ Playwright UI (npm run test:e2e:ui) vẫn đang mở — đóng cửa sổ đó (hoặc Ctrl+C ở terminal đã chạy nó) rồi chạy lại.");
      console.error(`  Nếu không phải: tìm tiến trình bằng \`lsof -iTCP:${port} -sTCP:LISTEN\` và tắt nó.\n`);
      resolve(false);
    });
    server.listen(port, () => server.close(() => resolve(true)));
  });
}

(async () => {
  const ports = process.env.E2E_NO_BUNNY ? [TEST_PORT] : [TEST_PORT, MOCK_BUNNY_PORT];
  for (const port of ports) if (!(await check(port))) process.exit(1);
})();
