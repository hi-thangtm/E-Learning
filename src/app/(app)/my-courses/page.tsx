import type { Metadata } from "next";
import Link from "next/link";
import { Inbox } from "lucide-react";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getPendingAcknowledgements } from "@/lib/acknowledgements";
import { getMyEnrollmentCounts, getMyEnrollments, getNextLessonIds, MY_TABS, type MyTab } from "@/lib/learning";
import { getPathLocks, lockKey } from "@/lib/path-lock";
import { buildHref, getEnumParam, getParam, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { CourseCard } from "./course-card";
import { EmptyFiltered, EmptyState } from "@/components/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";

export const metadata: Metadata = { title: "Khoá học của tôi" };

const PATHNAME = "/my-courses";
const TAB_LABELS: Record<MyTab, string> = {
  all: "Tất cả",
  inProgress: "Đang học",
  notStarted: "Chưa bắt đầu",
  completed: "Hoàn thành",
  overdue: "Quá hạn",
};
const EMPTY: Record<MyTab, string> = {
  all: "Bạn chưa được giao khoá học nào.",
  inProgress: "Chưa có khoá nào đang học. Bấm “Bắt đầu” ở một khoá để học.",
  notStarted: "Không còn khoá nào chưa bắt đầu.",
  completed: "Chưa hoàn thành khoá nào — cố lên!",
  overdue: "Tuyệt vời, không có khoá nào quá hạn.",
};

const PAGE_SIZE = 12;

/** Khoá học của tôi (mục 2.3) — chỉ lượt học của chính người đăng nhập. */
export default async function MyCoursesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab = getEnumParam(sp, "tab", MY_TABS) ?? "all";
  const q = getParam(sp, "q").slice(0, 100);

  // Danh mục có trong các khoá của tôi
  const categories = await prisma.courseCategory.findMany({
    where: { courses: { some: { enrollments: { some: { userId: user.id, status: { not: "CANCELLED" } } } } } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const categoryId = categories.find((c) => c.id === getParam(sp, "category"))?.id;

  const [allEnrollments, counts, pendingUpdates] = await Promise.all([
    getMyEnrollments(user.id, { tab, q, categoryId }),
    getMyEnrollmentCounts(user.id, { q, categoryId }),
    getPendingAcknowledgements(user.id),
  ]);
  // Phân trang 12 thẻ / trang (danh sách đã xếp: quá hạn → đang học theo hạn → đã xong)
  const totalPages = Math.max(1, Math.ceil(allEnrollments.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Math.floor(Number(getParam(sp, "page")) || 1)));
  const enrollments = allEnrollments.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // Khoá đã học xong nhưng chưa xác nhận bản MINOR mới -> badge "Có cập nhật"
  const updatedCourses = new Set(pendingUpdates.map((p) => p.courseId));
  const [nextLessons, pathLocks] = await Promise.all([
    getNextLessonIds(
      user.id,
      enrollments.filter((e) => e.status !== "COMPLETED").map((e) => e.course.id),
    ),
    // Khoá 🔒 theo lộ trình (Việc 23B)
    getPathLocks(enrollments.map((e) => ({ userId: user.id, courseId: e.course.id, learningPathId: e.learningPathId }))),
  ]);
  const filtered = !!q || !!categoryId;

  return (
    <>
      <PageHeader title="Khoá học của tôi" description="Các khoá học bạn được giao hoặc tự đăng ký, kèm tiến độ và hạn hoàn thành." />

      <section className="rounded-md bg-card shadow-md">
        <nav aria-label="Lọc theo trạng thái" className="flex gap-1 overflow-x-auto border-b border-border px-4 sm:px-6">
          {MY_TABS.map((t) => {
            const active = t === tab;
            return (
              <Link
                key={t}
                href={buildHref(PATHNAME, sp, { tab: t === "all" ? null : t, page: null })}
                scroll={false}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-[15px] transition-colors",
                  active ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {TAB_LABELS[t]}
                <span
                  className={cn(
                    "inline-flex shrink-0 items-center rounded-full px-2 text-[12px] whitespace-nowrap tabular-nums",
                    t === "overdue" && counts.overdue > 0
                      ? "bg-destructive/16 text-destructive"
                      : active
                        ? "bg-primary/16 text-primary"
                        : "bg-muted text-muted-foreground",
                  )}
                >
                  {counts[t]}
                </span>
              </Link>
            );
          })}
        </nav>

        <div className="flex flex-col-reverse items-stretch justify-end gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
          <div className="w-full sm:w-64">
            <DataTableFilter
              param="category"
              label="Danh mục"
              allLabel="Mọi danh mục"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <DataTableSearch placeholder="Tìm tên khoá học..." />
        </div>

        <div className="px-4 pb-4 sm:px-6 sm:pb-6">
          {enrollments.length === 0 ? (
            filtered ? (
              <EmptyFiltered clearHref={buildHref(PATHNAME, sp, { q: null, category: null, page: null })} />
            ) : (
              <EmptyState
                icon={Inbox}
                title={EMPTY[tab]}
                action={
                  tab === "all" && (
                    <Link href="/library" className={buttonVariants()}>
                      Xem các khoá cho phép tự đăng ký
                    </Link>
                  )
                }
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
              {enrollments.map((e) => (
                <CourseCard
                  key={e.id}
                  enrollment={e}
                  nextLessonId={nextLessons.get(e.course.id) ?? null}
                  hasUpdate={updatedCourses.has(e.course.id)}
                  pathLock={pathLocks.get(lockKey(user.id, e.course.id)) ?? null}
                />
              ))}
            </div>
          )}
        </div>
        {allEnrollments.length > PAGE_SIZE && (
          <DataTablePagination pathname={PATHNAME} searchParams={sp} page={page} pageSize={PAGE_SIZE} total={allEnrollments.length} />
        )}
      </section>
    </>
  );
}
