import "server-only";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { findCourseInScope } from "@/lib/course-scope";
import type { CurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/table-params";
import { formatDecimal, formatNumber } from "@/lib/format";

/**
 * Đánh giá khoá học (Việc 25 — feature-spec 2.4, 4.3). Chỉ chạy ở server.
 * - Mỗi người 1 đánh giá / khoá (@@unique courseId + userId), sửa được.
 * - Chỉ người từng học xong khoá (COMPLETED, hoặc đã có completedVersion — kể cả đang học lại sau MAJOR).
 * - Nhận xét là chữ thường (không HTML). Không ghi audit, không thông báo.
 */

export const REVIEW_COMMENT_MAX = 1000;
export const REVIEWS_PAGE_SIZE = 20;
/** Thư viện: dưới ngưỡng này hiện “Chưa đủ đánh giá” */
export const MIN_PUBLIC_REVIEWS = 3;

export const reviewSchema = z.object({
  rating: z.number("Vui lòng chọn số sao.").int("Số sao không hợp lệ.").min(1, "Vui lòng chọn số sao.").max(5, "Số sao không hợp lệ."),
  comment: z
    .string()
    .trim()
    .max(REVIEW_COMMENT_MAX, `Nhận xét tối đa ${formatNumber(REVIEW_COMMENT_MAX)} ký tự.`)
    .transform((v) => v || null),
});

export type MyReview = { rating: number; comment: string | null; updatedAt: Date };

/** Được đánh giá: lượt học (khác CANCELLED) đã COMPLETED hoặc từng học xong (completedVersion). */
export async function canReview(userId: string, courseId: string): Promise<boolean> {
  if (!courseId || courseId.length > 50) return false;
  const e = await prisma.enrollment.findFirst({
    where: { userId, courseId, status: { not: "CANCELLED" }, OR: [{ status: "COMPLETED" }, { completedVersion: { not: null } }] },
    select: { id: true },
  });
  return !!e;
}

export async function getMyReview(userId: string, courseId: string): Promise<MyReview | null> {
  if (!courseId || courseId.length > 50) return null;
  return prisma.courseReview.findUnique({
    where: { courseId_userId: { courseId, userId } },
    select: { rating: true, comment: true, updatedAt: true },
  });
}

export async function upsertMyReview(
  userId: string,
  courseId: string,
  input: { rating: unknown; comment: unknown },
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(await canReview(userId, courseId))) return { ok: false, message: "Chỉ đánh giá được khoá bạn đã học xong." };
  const parsed = reviewSchema.safeParse({ rating: input.rating, comment: typeof input.comment === "string" ? input.comment : "" });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Đánh giá không hợp lệ." };
  await prisma.courseReview.upsert({
    where: { courseId_userId: { courseId, userId } },
    create: { courseId, userId, ...parsed.data },
    update: parsed.data,
  });
  return { ok: true };
}

/** Điểm TB 1 chữ số thập phân. */
const round1 = (v: number) => Math.round(v * 10) / 10;

/** “4,6” theo vi-VN. */
export function formatRating(average: number): string {
  return formatDecimal(average, 1, true);
}

export type RatingSummary = { average: number; total: number; counts: Record<1 | 2 | 3 | 4 | 5, number> };

export async function getCourseRatingSummary(courseId: string): Promise<RatingSummary> {
  const rows = await prisma.courseReview.groupBy({ by: ["rating"], where: { courseId }, _count: { _all: true } });
  const counts: RatingSummary["counts"] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let total = 0;
  let sum = 0;
  for (const r of rows) {
    if (r.rating < 1 || r.rating > 5) continue;
    counts[r.rating as 1 | 2 | 3 | 4 | 5] = r._count._all;
    total += r._count._all;
    sum += r.rating * r._count._all;
  }
  return { average: total ? round1(sum / total) : 0, total, counts };
}

/** Điểm TB + số lượt của nhiều khoá (không có = không có trong Map). */
export async function getRatingSummaries(courseIds: string[]): Promise<Map<string, { average: number; total: number }>> {
  if (courseIds.length === 0) return new Map();
  const rows = await prisma.courseReview.groupBy({
    by: ["courseId"],
    where: { courseId: { in: courseIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.courseId, { average: round1(r._avg.rating ?? 0), total: r._count._all }]));
}

export type ReviewFilters = { stars?: number | null; withComment?: boolean };

/** Bộ lọc tab Đánh giá từ URL: ?stars=1..5, ?comment=1 (dùng chung trang + xuất Excel). */
export function parseReviewFilters(sp: SearchParams): { stars: number | null; withComment: boolean } {
  const stars = Number(getParam(sp, "stars"));
  return {
    stars: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : null,
    withComment: getParam(sp, "comment") === "1",
  };
}

function reviewWhere(courseId: string, f: ReviewFilters): Prisma.CourseReviewWhereInput {
  return {
    courseId,
    ...(f.stars && { rating: f.stars }),
    ...(f.withComment && { comment: { not: null } }),
  };
}

const REVIEW_SELECT = {
  id: true,
  rating: true,
  comment: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { fullName: true, employeeCode: true, department: { select: { name: true } } } },
} satisfies Prisma.CourseReviewSelect;

export type CourseReviewRow = Prisma.CourseReviewGetPayload<{ select: typeof REVIEW_SELECT }>;

/**
 * Nhận xét của 1 khoá — chỉ người soạn / quản trị thấy được khoá (phạm vi như /content/courses);
 * ngoài Admin tập đoàn chỉ thấy nhận xét của nhân viên công ty mình (Quy tắc 1 — Việc 29A).
 * null = khoá không tồn tại / ngoài phạm vi. `page = "all"` -> mọi dòng (xuất Excel).
 */
export async function listCourseReviews(
  actor: CurrentUser,
  courseId: string,
  f: ReviewFilters & { page: number | "all" },
): Promise<{ rows: CourseReviewRow[]; total: number } | null> {
  const course = await findCourseInScope(actor, courseId, { id: true });
  if (!course) return null;
  // Danh sách có họ tên / mã NV / phòng ban → theo phạm vi nhân viên (Quy tắc 1): ngoài Admin tập đoàn chỉ thấy người công ty mình
  const where: Prisma.CourseReviewWhereInput = {
    ...reviewWhere(course.id, f),
    ...(actor.role !== "GROUP_ADMIN" && { user: { companyId: actor.companyId } }),
  };
  const [total, rows] = await prisma.$transaction([
    prisma.courseReview.count({ where }),
    prisma.courseReview.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(f.page !== "all" && { skip: (f.page - 1) * REVIEWS_PAGE_SIZE, take: REVIEWS_PAGE_SIZE }),
      select: REVIEW_SELECT,
    }),
  ]);
  return { rows, total };
}

/** Đã sửa sau khi tạo (lệch > 1 giây). */
export function isEdited(r: { createdAt: Date; updatedAt: Date }): boolean {
  return r.updatedAt.getTime() - r.createdAt.getTime() > 1000;
}
