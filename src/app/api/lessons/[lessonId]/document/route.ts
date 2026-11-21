import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";
import { findLessonForEdit } from "@/lib/course-content";
import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { deleteFile, FILE_RULES, saveFile } from "@/lib/storage";

/**
 * Tải file PDF cho bài Tài liệu: POST /api/lessons/<lessonId>/document  (multipart, ô "file")
 *
 * Dùng route handler thay vì server action vì PDF tối đa 20MB, còn server action giới hạn 6MB (next.config.ts).
 * Thứ tự kiểm tra: đăng nhập + vai trò -> cùng nguồn (chống CSRF) -> bài thuộc phạm vi + được sửa
 * -> dung lượng khai báo TRƯỚC khi đọc body -> loại file theo NỘI DUNG (storage.ts).
 */

const EDITOR_ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"];
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

  const saved = await saveFile(file, "courses/documents", "pdf");
  if ("error" in saved) return json({ error: saved.error }, 400);

  // Tên gốc chỉ để hiển thị (không dùng làm đường dẫn)
  const fileName = file.name.replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "tai-lieu.pdf";
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
