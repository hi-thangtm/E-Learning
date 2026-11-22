import { findCourseInScope } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { addSimpleSheet, createWorkbook, workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { getSetting } from "@/lib/settings";
import { formatDate } from "@/lib/format";
import { listCourseReviews, parseReviewFilters, type CourseReviewRow } from "@/lib/reviews";

/**
 * Xuất đánh giá của 1 khoá (theo bộ lọc đang chọn): GET /content/courses/<id>/reviews/export?stars=&comment=1.
 * Xem được khoá (phạm vi như /content/courses) là xuất được.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const { id } = await params;
  const course = await findCourseInScope(actor, id, { id: true, code: true, title: true });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const list = course ? await listCourseReviews(actor, course.id, { ...parseReviewFilters(sp), page: "all" }) : null;
  if (!course || !list) {
    return new Response("Không tìm thấy khoá học hoặc bạn không có quyền xem.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const wb = createWorkbook(await getSetting("SYSTEM_NAME"));
  addSimpleSheet<CourseReviewRow>(
    wb,
    "Đánh giá",
    [
      { header: "Ngày", width: 14, value: (r) => formatDate(r.createdAt) },
      { header: "Mã NV", width: 14, value: (r) => r.user.employeeCode },
      { header: "Họ tên", width: 28, value: (r) => r.user.fullName },
      { header: "Phòng ban", width: 28, value: (r) => r.user.department?.name ?? "" },
      { header: "Số sao", width: 10, value: (r) => r.rating },
      { header: "Nhận xét", width: 80, value: (r) => r.comment ?? "" },
    ],
    list.rows,
  );
  return xlsxResponse(await workbookToBuffer(wb), `danh-gia-${course.code}.xlsx`);
}
