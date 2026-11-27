import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { findLessonForEdit } from "@/lib/course-content";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { z } from "zod";
import {
  deleteFile,
  FILE_RULES,
  LESSON_DOCUMENT_FOLDER as DOCUMENT_FOLDER,
  saveFile,
  USE_BLOB_STORAGE,
  verifyUploadedFile,
  type SavedFile,
} from "@/lib/storage";

/**
 * Tải file PDF cho bài Tài liệu: POST /api/lessons/<lessonId>/document
 *
 * 2 cách (tuỳ nơi lưu — src/lib/storage.ts):
 * - Ổ đĩa (máy / Docker): multipart, ô "file". Dùng route handler vì PDF tối đa 20MB, server action giới hạn 6MB.
 * - Vercel Blob: Vercel giới hạn request 4,5MB → trình duyệt tải THẲNG lên Blob (token cấp ở ./upload/route.ts),
 *   rồi gửi JSON { key, fileName } về đây để kiểm tra (dung lượng + loại theo NỘI DUNG) và gắn vào bài.
 * Thứ tự kiểm tra: đăng nhập + vai trò -> cùng nguồn (chống CSRF) -> bài thuộc phạm vi + được sửa -> file.
 */

const EDITOR_ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"];

const directSchema = z.object({
  key: z.string().max(300),
  fileName: z.string().max(500),
});
// Phần đầu multipart (ranh giới, tên ô...) cộng thêm ngoài dung lượng file
const MULTIPART_OVERHEAD = 64 * 1024;

function json(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, ctx: { params: Promise<{ lessonId: string }> }) {
  const actor = await getCurrentUser();
  if (!actor) return json({ error: "Bạn cần đăng nhập." }, 401);
  if (actor.mustChangePassword || !EDITOR_ROLES.includes(actor.role)) {
    return json({ error: "Bạn không có quyền sửa khoá học." }, 403);
  }

  // Chỉ nhận yêu cầu từ chính trang của hệ thống
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!origin || !host || new URL(origin).host !== host) return json({ error: "Yêu cầu không hợp lệ." }, 403);

  const { lessonId } = await ctx.params;
  const lesson = await findLessonForEdit(actor, lessonId);
  if (!lesson) return json({ error: "Không tìm thấy bài học hoặc bạn không có quyền sửa." }, 404);
  if (lesson.type !== "DOCUMENT") return json({ error: "Chỉ bài Tài liệu mới đính kèm được PDF." }, 400);

  let saved: SavedFile;
  let originalName: string;

  if (request.headers.get("content-type")?.startsWith("application/json")) {
    // --- File đã tải thẳng lên Vercel Blob ---
    if (!USE_BLOB_STORAGE) return json({ error: "Yêu cầu không hợp lệ." }, 400);
    const parsed = directSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Yêu cầu không hợp lệ." }, 400);
    const { key, fileName } = parsed.data;
    // File đã gắn vào bài khác thì không nhận (chống lấy file của bài khác rồi xoá mất khi thay file)
    if (await prisma.lesson.count({ where: { fileUrl: key } })) return json({ error: "Đường dẫn file không hợp lệ." }, 400);
    const verified = await verifyUploadedFile(key, DOCUMENT_FOLDER, "pdf");
    if ("error" in verified) return json({ error: verified.error }, 400);
    saved = verified;
    originalName = fileName;
  } else {
    // --- Multipart (lưu ổ đĩa) ---
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (!declared || declared > FILE_RULES.pdf.maxBytes + MULTIPART_OVERHEAD) {
      return json({ error: "File PDF tối đa 20MB." }, 413);
    }

    let file: FormDataEntryValue | null;
    try {
      file = (await request.formData()).get("file");
    } catch {
      return json({ error: "Không đọc được file tải lên." }, 400);
    }
    if (!(file instanceof File)) return json({ error: "Vui lòng chọn file PDF." }, 400);

    const result = await saveFile(file, DOCUMENT_FOLDER, "pdf");
    if ("error" in result) return json({ error: result.error }, 400);
    saved = result;
    originalName = file.name;
  }

  // Tên gốc chỉ để hiển thị (không dùng làm đường dẫn)
  const fileName = originalName.replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "tai-lieu.pdf";
  const course = lesson.section.course;

  try {
    await prisma.$transaction([
      prisma.lesson.update({ where: { id: lesson.id }, data: { fileUrl: saved.key, fileName } }),
      logAudit(prisma, {
        actorId: actor.id,
        companyId: course.ownerCompanyId,
        action: "LESSON_UPDATED",
        entityType: "Lesson",
        entityId: lesson.id,
        metadata: {
          courseId: course.id,
          courseCode: course.code,
          sectionTitle: lesson.section.title,
          lessonTitle: lesson.title,
          lessonType: lesson.type,
          changedFields: ["file"],
          before: { file: lesson.fileName },
          after: { file: fileName },
        },
      }),
    ]);
  } catch (error) {
    await deleteFile(saved.key);
    throw error;
  }

  // Lưu xong mới xoá file cũ
  await deleteFile(lesson.fileUrl);
  revalidatePath(`/content/courses/${course.id}`);
  return json({ ok: true, fileKey: saved.key, fileName });
}
