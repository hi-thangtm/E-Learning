import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { findLessonForEdit } from "@/lib/course-content";
import { getCurrentUser } from "@/lib/current-user";
import { FILE_RULES, isValidKey, LESSON_DOCUMENT_FOLDER, USE_BLOB_STORAGE } from "@/lib/storage";

/**
 * Cấp token để trình duyệt tải PDF THẲNG lên Vercel Blob: POST /api/lessons/<lessonId>/document/upload
 * (chỉ khi lưu bằng Vercel Blob — Vercel giới hạn request 4,5MB nên không gửi PDF 20MB qua server được).
 *
 * Kiểm tra giống ../route.ts: đăng nhập + vai trò -> cùng nguồn -> bài thuộc phạm vi + được sửa + là bài Tài liệu.
 * Token chỉ cho đúng 1 đường dẫn `courses/documents/<id ngẫu nhiên>.pdf`, PDF ≤ 20MB, hết hạn sau 10 phút, không ghi đè.
 * Tải xong trình duyệt gọi ../route.ts (JSON) để kiểm tra NỘI DUNG file rồi mới gắn vào bài.
 */

const EDITOR_ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"];
const PATH_REGEX = new RegExp(`^${LESSON_DOCUMENT_FOLDER}/[a-f0-9]{32}\\.pdf$`);

class UploadDenied extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  if (!USE_BLOB_STORAGE) return json({ error: "Không tìm thấy." }, 404);

  const actor = await getCurrentUser();
  if (!actor) return json({ error: "Bạn cần đăng nhập." }, 401);
  if (actor.mustChangePassword || !EDITOR_ROLES.includes(actor.role)) {
    return json({ error: "Bạn không có quyền sửa khoá học." }, 403);
  }

  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return json({ error: "Yêu cầu không hợp lệ." }, 403);

  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body || body.type !== "blob.generate-client-token") return json({ error: "Yêu cầu không hợp lệ." }, 400);

  const { lessonId } = await ctx.params;

  try {
    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (pathname) => {
        if (!isValidKey(pathname) || !PATH_REGEX.test(pathname)) throw new UploadDenied("Đường dẫn file không hợp lệ.", 400);
        const lesson = await findLessonForEdit(actor, lessonId);
        if (!lesson) throw new UploadDenied("Không tìm thấy bài học hoặc bạn không có quyền sửa.", 404);
        if (lesson.type !== "DOCUMENT") throw new UploadDenied("Chỉ bài Tài liệu mới đính kèm được PDF.", 400);
        return {
          allowedContentTypes: ["application/pdf"],
          maximumSizeInBytes: FILE_RULES.pdf.maxBytes,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60_000,
        };
      },
    });
    return json(result);
  } catch (error) {
    if (error instanceof UploadDenied) return json({ error: error.message }, error.status);
    console.error("[blob-upload] Không cấp được token:", error);
    return json({ error: "Không tải được file, vui lòng thử lại." }, 500);
  }
}
