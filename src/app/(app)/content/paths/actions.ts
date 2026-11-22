"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { CourseStatus } from "@prisma/client";
import { z } from "zod";
import { fieldErrors, formValues, type ActionState } from "@/lib/action-state";
import { assignAppendedCourse } from "@/lib/assignment";
import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canEditPath, findPathInScope, selectableCoursesWhere } from "@/lib/path-scope";

/**
 * Lộ trình học (Việc 23A) — Biên soạn, Admin công ty, Admin tập đoàn. Phạm vi như khoá học (src/lib/path-scope.ts).
 * Nháp: thêm / bỏ / sắp xếp khoá. Đã phát hành: chỉ thêm khoá vào cuối (tự giao cho người đang có lộ trình).
 * Không xoá: lưu trữ / khôi phục. Mọi thao tác ghi audit_logs.
 */

const ROLES = ["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"] as const;
const NO_ACCESS = "Lộ trình không tồn tại hoặc bạn không có quyền sửa.";
const idSchema = z.string().trim().min(1).max(50);

const codeSchema = z
  .string()
  .trim()
  .min(1, "Vui lòng nhập mã lộ trình.")
  .transform((v) => v.toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9_-]{2,30}$/, "Mã chỉ gồm chữ in hoa không dấu, số, gạch ngang hoặc gạch dưới (2–30 ký tự)."));
const titleSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/\s+/g, " "))
  .pipe(z.string().min(3, "Tên lộ trình tối thiểu 3 ký tự.").max(200, "Tên lộ trình tối đa 200 ký tự."));

const PATH_SELECT = { id: true, code: true, title: true, status: true, ownerCompanyId: true } as const;

/** Lộ trình trong phạm vi VÀ được sửa. */
async function loadEditable(pathId: string) {
  const actor = await requireRole([...ROLES]);
  const id = idSchema.safeParse(pathId);
  const path = id.success ? await findPathInScope(actor, id.data, PATH_SELECT) : null;
  return { actor, path: path && canEditPath(actor, path) ? path : null };
}

function revalidate(pathId?: string) {
  revalidatePath("/content/paths");
  if (pathId) revalidatePath(`/content/paths/${pathId}`);
}

// ---------------------------------------------------------------------------------------------

export async function createPathAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await requireRole([...ROLES]);
  const parsed = z.object({ code: codeSchema, title: titleSchema }).safeParse({
    code: String(formData.get("code") ?? ""),
    title: String(formData.get("title") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, ["code", "title"]) };

  const dup = await prisma.learningPath.findUnique({ where: { code: parsed.data.code }, select: { id: true } });
  if (dup) return { errors: { code: `Mã lộ trình “${parsed.data.code}” đã tồn tại.` }, values: formValues(formData, ["code", "title"]) };

  const path = await prisma.$transaction(async (tx) => {
    const created = await tx.learningPath.create({
      data: { code: parsed.data.code, title: parsed.data.title, ownerCompanyId: actor.companyId },
      select: { id: true },
    });
    await logAudit(tx, {
      actorId: actor.id,
      companyId: actor.companyId,
      action: "PATH_CREATED",
      entityType: "LearningPath",
      entityId: created.id,
      metadata: { code: parsed.data.code, title: parsed.data.title },
    });
    return created;
  });

  revalidate();
  redirect(`/content/paths/${path.id}`);
}

export async function updatePathInfoAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { actor, path } = await loadEditable(String(formData.get("id") ?? ""));
  if (!path) return { message: NO_ACCESS };

  const parsed = z
    .object({
      title: titleSchema,
      description: z
        .string()
        .trim()
        .max(2000, "Mô tả tối đa 2.000 ký tự.")
        .transform((v) => v || null),
    })
    .safeParse({ title: String(formData.get("title") ?? ""), description: String(formData.get("description") ?? "") });
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: formValues(formData, ["title", "description"]) };

  await prisma.$transaction([
    prisma.learningPath.update({ where: { id: path.id }, data: parsed.data }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: path.ownerCompanyId,
      action: "PATH_UPDATED",
      entityType: "LearningPath",
      entityId: path.id,
      metadata: { code: path.code, change: "Sửa tên / mô tả", before: { title: path.title }, after: { title: parsed.data.title } },
    }),
  ]);
  revalidate(path.id);
  return { ok: true, message: "Đã lưu thông tin lộ trình." };
}

/** Khoá được thêm vào lộ trình này (đúng phạm vi + đang PUBLISHED). */
async function loadSelectableCourse(path: { ownerCompanyId: string }, courseId: string) {
  const id = idSchema.safeParse(courseId);
  if (!id.success) return null;
  return prisma.course.findFirst({
    where: { AND: [{ id: id.data }, await selectableCoursesWhere(path)] },
    select: { id: true, code: true, title: true },
  });
}

/** Nháp: thêm khoá vào cuối danh sách. */
export async function addCourseAction(pathId: string, courseId: string): Promise<ActionState> {
  const { actor, path } = await loadEditable(pathId);
  if (!path) return { message: NO_ACCESS };
  if (path.status !== "DRAFT") return { message: "Lộ trình đã phát hành — dùng “Thêm khoá vào cuối”." };
  const course = await loadSelectableCourse(path, courseId);
  if (!course) return { message: "Khoá học không tồn tại, chưa phát hành hoặc không thêm được vào lộ trình này." };

  const exists = await prisma.learningPathCourse.findUnique({
    where: { learningPathId_courseId: { learningPathId: path.id, courseId: course.id } },
    select: { courseId: true },
  });
  if (exists) return { message: "Khoá này đã có trong lộ trình." };

  const last = await prisma.learningPathCourse.aggregate({ where: { learningPathId: path.id }, _max: { sortOrder: true } });
  await prisma.$transaction([
    prisma.learningPathCourse.create({
      data: { learningPathId: path.id, courseId: course.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    }),
    prisma.learningPath.update({ where: { id: path.id }, data: { updatedAt: new Date() } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: path.ownerCompanyId,
      action: "PATH_UPDATED",
      entityType: "LearningPath",
      entityId: path.id,
      metadata: { code: path.code, change: `Thêm khoá ${course.code}` },
    }),
  ]);
  revalidate(path.id);
  return { ok: true, message: `Đã thêm khoá ${course.code}.` };
}

/** Nháp: bỏ khoá khỏi lộ trình. */
export async function removeCourseAction(pathId: string, courseId: string): Promise<ActionState> {
  const { actor, path } = await loadEditable(pathId);
  if (!path) return { message: NO_ACCESS };
  if (path.status !== "DRAFT") return { message: "Lộ trình đã phát hành — không bỏ khoá được nữa." };
  const id = idSchema.safeParse(courseId);
  if (!id.success) return { message: "Không xác định được khoá học." };

  const row = await prisma.learningPathCourse.findUnique({
    where: { learningPathId_courseId: { learningPathId: path.id, courseId: id.data } },
    select: { course: { select: { code: true } } },
  });
  if (!row) return { message: "Khoá này không có trong lộ trình." };

  await prisma.$transaction([
    prisma.learningPathCourse.delete({ where: { learningPathId_courseId: { learningPathId: path.id, courseId: id.data } } }),
    prisma.learningPath.update({ where: { id: path.id }, data: { updatedAt: new Date() } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: path.ownerCompanyId,
      action: "PATH_UPDATED",
      entityType: "LearningPath",
      entityId: path.id,
      metadata: { code: path.code, change: `Bỏ khoá ${row.course.code}` },
    }),
  ]);
  revalidate(path.id);
  return { ok: true, message: `Đã bỏ khoá ${row.course.code} khỏi lộ trình.` };
}

/** Nháp: lưu thứ tự mới (toàn bộ danh sách id khoá theo thứ tự). */
export async function reorderCoursesAction(pathId: string, courseIds: string[]): Promise<ActionState> {
  const { actor, path } = await loadEditable(pathId);
  if (!path) return { message: NO_ACCESS };
  if (path.status !== "DRAFT") return { message: "Lộ trình đã phát hành — không đổi thứ tự được nữa." };

  const parsed = z.array(idSchema).max(200).safeParse(courseIds);
  if (!parsed.success) return { message: "Thứ tự không hợp lệ." };
  const current = await prisma.learningPathCourse.findMany({ where: { learningPathId: path.id }, select: { courseId: true } });
  const known = new Set(current.map((c) => c.courseId));
  if (parsed.data.length !== known.size || !parsed.data.every((id) => known.has(id))) {
    return { message: "Danh sách khoá đã thay đổi — tải lại trang rồi thử lại." };
  }

  await prisma.$transaction([
    ...parsed.data.map((courseId, i) =>
      prisma.learningPathCourse.update({
        where: { learningPathId_courseId: { learningPathId: path.id, courseId } },
        data: { sortOrder: i },
      }),
    ),
    prisma.learningPath.update({ where: { id: path.id }, data: { updatedAt: new Date() } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: path.ownerCompanyId,
      action: "PATH_UPDATED",
      entityType: "LearningPath",
      entityId: path.id,
      metadata: { code: path.code, change: "Đổi thứ tự khoá" },
    }),
  ]);
  revalidate(path.id);
  return { ok: true };
}

/** Phát hành: cần ≥ 2 khoá, tất cả đang PUBLISHED. */
export async function publishPathAction(pathId: string): Promise<ActionState> {
  const { actor, path } = await loadEditable(pathId);
  if (!path) return { message: NO_ACCESS };
  if (path.status !== "DRAFT") return { message: "Chỉ phát hành được lộ trình ở trạng thái Nháp." };

  const courses = await prisma.learningPathCourse.findMany({
    where: { learningPathId: path.id },
    select: { course: { select: { code: true, status: true } } },
  });
  if (courses.length < 2) return { message: "Lộ trình cần ít nhất 2 khoá học mới phát hành được." };
  const notPublished = courses.filter((c) => c.course.status !== "PUBLISHED").map((c) => c.course.code);
  if (notPublished.length > 0) return { message: `Khoá chưa phát hành / đã lưu trữ: ${notPublished.join(", ")}.` };

  const updated = await prisma.$transaction(async (tx) => {
    const r = await tx.learningPath.updateMany({ where: { id: path.id, status: "DRAFT" }, data: { status: "PUBLISHED" } });
    if (r.count === 0) return false;
    await logAudit(tx, {
      actorId: actor.id,
      companyId: path.ownerCompanyId,
      action: "PATH_PUBLISHED",
      entityType: "LearningPath",
      entityId: path.id,
      metadata: { code: path.code, title: path.title, courseCount: courses.length },
    });
    return true;
  });
  if (!updated) return { message: "Lộ trình vừa được thay đổi — tải lại trang." };
  revalidate(path.id);
  return { ok: true, message: `Đã phát hành lộ trình ${path.code}.` };
}

/** Đã phát hành: thêm khoá vào cuối + tự giao khoá đó cho mọi người đang có lộ trình (cùng hạn của họ). */
export async function appendCourseAction(pathId: string, courseId: string): Promise<ActionState> {
  const { actor, path } = await loadEditable(pathId);
  if (!path) return { message: NO_ACCESS };
  if (path.status !== "PUBLISHED") return { message: "Chỉ thêm khoá vào cuối khi lộ trình đã phát hành." };
  const course = await loadSelectableCourse(path, courseId);
  if (!course) return { message: "Khoá học không tồn tại, chưa phát hành hoặc không thêm được vào lộ trình này." };

  const exists = await prisma.learningPathCourse.findUnique({
    where: { learningPathId_courseId: { learningPathId: path.id, courseId: course.id } },
    select: { courseId: true },
  });
  if (exists) return { message: "Khoá này đã có trong lộ trình." };

  const last = await prisma.learningPathCourse.aggregate({ where: { learningPathId: path.id }, _max: { sortOrder: true } });
  await prisma.$transaction([
    prisma.learningPathCourse.create({
      data: { learningPathId: path.id, courseId: course.id, sortOrder: (last._max.sortOrder ?? -1) + 1 },
    }),
    prisma.learningPath.update({ where: { id: path.id }, data: { updatedAt: new Date() } }),
  ]);

  // Giao khoá mới cho người đang có lộ trình (ngoài transaction: assignCourse tự chia lô + ghi nhật ký giao)
  const assigned = await assignAppendedCourse({ learningPathId: path.id, courseId: course.id, actorId: actor.id });
  await logAudit(prisma, {
    actorId: actor.id,
    companyId: path.ownerCompanyId,
    action: "PATH_COURSE_APPENDED",
    entityType: "LearningPath",
    entityId: path.id,
    metadata: { code: path.code, courseId: course.id, courseCode: course.code, assigned },
  });

  revalidate(path.id);
  revalidatePath("/assign/manual");
  return { ok: true, message: `Đã thêm khoá ${course.code} vào cuối lộ trình — giao thêm cho ${assigned} người.` };
}

async function setPathStatus(pathId: string, kind: "archive" | "restore"): Promise<ActionState> {
  const { actor, path } = await loadEditable(pathId);
  if (!path) return { message: NO_ACCESS };
  if (kind === "archive" && path.status === "ARCHIVED") return { message: "Lộ trình đã ở trạng thái Lưu trữ." };
  if (kind === "restore" && path.status !== "ARCHIVED") return { message: "Lộ trình không ở trạng thái Lưu trữ." };

  // Khôi phục: đã từng phát hành -> Đã phát hành; chưa -> Nháp
  let to: CourseStatus = "ARCHIVED";
  if (kind === "restore") {
    const published = await prisma.auditLog.findFirst({
      where: { action: "PATH_PUBLISHED", entityType: "LearningPath", entityId: path.id },
      select: { id: true },
    });
    to = published ? "PUBLISHED" : "DRAFT";
  }

  await prisma.$transaction([
    prisma.learningPath.update({ where: { id: path.id }, data: { status: to } }),
    logAudit(prisma, {
      actorId: actor.id,
      companyId: path.ownerCompanyId,
      action: kind === "archive" ? "PATH_ARCHIVED" : "PATH_RESTORED",
      entityType: "LearningPath",
      entityId: path.id,
      metadata: { code: path.code, title: path.title, from: path.status, to },
    }),
  ]);
  revalidate(path.id);
  return {
    ok: true,
    message:
      kind === "archive"
        ? `Đã lưu trữ lộ trình ${path.code}. Không giao mới được; lượt học đã giao vẫn giữ nguyên.`
        : `Đã khôi phục lộ trình ${path.code} về ${to === "PUBLISHED" ? "Đã phát hành" : "Nháp"}.`,
  };
}

export async function archivePathAction(pathId: string): Promise<ActionState> {
  return setPathStatus(pathId, "archive");
}

export async function restorePathAction(pathId: string): Promise<ActionState> {
  return setPathStatus(pathId, "restore");
}
