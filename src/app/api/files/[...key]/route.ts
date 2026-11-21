import { getCurrentUser } from "@/lib/current-user";
import { canReadFile } from "@/lib/file-access";
import { isValidKey, readFile } from "@/lib/storage";

/**
 * Xem file đã lưu: GET /api/files/<key>   (VD /api/files/courses/thumbnails/3f9c…e1.webp)
 * - Bắt buộc đăng nhập (tài khoản đang hoạt động, công ty không tạm ngưng — xem getCurrentUser).
 * - File khoá học (`courses/...`): phải có lượt học khoá đó hoặc soạn / quản trị khoá đó theo phạm vi, sai → 403.
 * - Key được kiểm tra chặt (chỉ a-z 0-9 - /, có đuôi hợp lệ) -> không đi ra ngoài thư mục upload.
 * - Key chứa id ngẫu nhiên và file không bao giờ bị ghi đè -> cho trình duyệt lưu cache lâu (private).
 */
export async function GET(_request: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Bạn cần đăng nhập để xem file.", { status: 401, headers: TEXT });

  const { key: parts } = await ctx.params;
  const key = parts.join("/");
  if (!isValidKey(key)) return new Response("Đường dẫn file không hợp lệ.", { status: 400, headers: TEXT });

  // File khoá học: chỉ người có lượt học hoặc người soạn / quản trị khoá đó theo phạm vi (src/lib/file-access.ts)
  const access = await canReadFile(user, key);
  if (access === "missing") return new Response("Không tìm thấy file.", { status: 404, headers: TEXT });
  if (access === "forbidden") return new Response("Bạn không có quyền xem file này.", { status: 403, headers: TEXT });

  const file = await readFile(key);
  if (!file) return new Response("Không tìm thấy file.", { status: 404, headers: TEXT });

  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.data.length),
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}

const TEXT = { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" };
