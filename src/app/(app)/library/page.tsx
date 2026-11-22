import type { Metadata } from "next";
import Link from "next/link";
import { LibraryBig, SearchX } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { DataTableSearch } from "@/components/data-table/data-table-search";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getCourseStats, getMyLibraryStatus, libraryCourseWhere } from "@/lib/library";
import { getRatingSummaries, MIN_PUBLIC_REVIEWS } from "@/lib/reviews";
import { buildHref, getEnumParam, getParam, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { LibraryCard } from "./library-card";

export const metadata: Metadata = { title: "Thư viện khoá học" };

const PATHNAME = "/library";
const PAGE_SIZE = 12;
const SORTS = ["newest", "popular", "rating"] as const;
const SORT_LABELS: Record<(typeof SORTS)[number], string> = {
  newest: "Mới nhất",
  popular: "Nhiều người học nhất",
  rating: "Đánh giá cao nhất",
};
const COURSE_SELECT = {
  id: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  categoryId: true,
  category: { select: { name: true } },
} satisfies Prisma.CourseSelect;

/** Thư viện tự đăng ký (feature-spec 2.7) — khoá cho phép tự đăng ký của công ty tổng + công ty mình. */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const q = getParam(sp, "q").slice(0, 100);
  const sort = getEnumParam(sp, "sort", SORTS) ?? "newest";
  const requestedPage = Math.max(1, Math.floor(Number(getParam(sp, "page")) || 1));

  const base = await libraryCourseWhere(user);
  const categories = await prisma.courseCategory.findMany({
    where: { courses: { some: base } },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true },
  });
  const categoryId = categories.find((c) => c.id === getParam(sp, "category"))?.id;

  const where: Prisma.CourseWhereInput = {
    AND: [base, ...(q ? [{ title: { contains: q, mode: "insensitive" as const } }] : []), ...(categoryId ? [{ categoryId }] : [])],
  };
  const total = await prisma.course.count({ where });
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(total / PAGE_SIZE)));
  let courses: Prisma.CourseGetPayload<{ select: typeof COURSE_SELECT }>[];
  if (sort === "rating") {
    // Điểm TB không sắp được trong Prisma -> sắp trong bộ nhớ (thư viện nhỏ): đủ ngưỡng theo điểm TB rồi số lượt; chưa đủ xếp cuối (mới nhất trước)
    const all = await prisma.course.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true } });
    const summaries = await getRatingSummaries(all.map((c) => c.id));
    const score = (id: string) => {
      const r = summaries.get(id);
      return r && r.total >= MIN_PUBLIC_REVIEWS ? r : null;
    };
    const ordered = all
      .map((c, i) => ({ id: c.id, i, r: score(c.id) }))
      .sort((a, b) => {
        if (a.r && b.r) return b.r.average - a.r.average || b.r.total - a.r.total || a.i - b.i;
        if (a.r || b.r) return a.r ? -1 : 1;
        return a.i - b.i;
      })
      .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
      .map((c) => c.id);
    const rows = await prisma.course.findMany({ where: { id: { in: ordered } }, select: COURSE_SELECT });
    const byId = new Map(rows.map((r) => [r.id, r]));
    courses = ordered.map((id) => byId.get(id)!).filter(Boolean);
  } else {
    courses = await prisma.course.findMany({
      where,
      orderBy: sort === "popular" ? [{ enrollments: { _count: "desc" } }, { createdAt: "desc" }] : [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: COURSE_SELECT,
    });
  }
  const ids = courses.map((c) => c.id);
  const [stats, myStatus, ratings] = await Promise.all([getCourseStats(ids), getMyLibraryStatus(user.id, ids), getRatingSummaries(ids)]);
  const filtered = !!q || !!categoryId;

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] whitespace-nowrap transition-colors",
      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-primary/16 hover:text-primary",
    );

  return (
    <>
      <PageHeader title="Thư viện khoá học" description="Các khoá học bạn có thể tự đăng ký để học thêm — không có hạn hoàn thành." />

      <section className="rounded-md bg-card shadow-md">
        <div className="flex flex-wrap items-center justify-between gap-4 p-6 pb-4">
          <div className="w-full max-w-sm">
            <DataTableSearch placeholder="Tìm tên khoá học..." />
          </div>
          <nav aria-label="Sắp xếp" className="flex items-center gap-2">
            <span className="text-[13px] text-muted-foreground">Sắp xếp:</span>
            {SORTS.map((s) => (
              <Link
                key={s}
                href={buildHref(PATHNAME, sp, { sort: s === "newest" ? null : s, page: null })}
                scroll={false}
                aria-current={s === sort ? "page" : undefined}
                className={chip(s === sort)}
              >
                {SORT_LABELS[s]}
              </Link>
            ))}
          </nav>
        </div>

        {categories.length > 0 && (
          <nav aria-label="Lọc theo danh mục" className="flex flex-wrap gap-2 px-6 pb-4">
            <Link href={buildHref(PATHNAME, sp, { category: null, page: null })} scroll={false} className={chip(!categoryId)}>
              Tất cả
            </Link>
            {categories.map((c) => (
              <Link
                key={c.id}
                href={buildHref(PATHNAME, sp, { category: c.id, page: null })}
                scroll={false}
                aria-current={c.id === categoryId ? "page" : undefined}
                className={chip(c.id === categoryId)}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}

        <div className="px-6 pb-6">
          {courses.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-14 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
                {filtered ? <SearchX className="size-8" /> : <LibraryBig className="size-8" />}
              </div>
              <p className="text-lg font-medium text-foreground">
                {filtered ? "Không tìm thấy khoá học phù hợp" : "Thư viện chưa có khoá học nào"}
              </p>
              {filtered ? (
                <Link href={buildHref(PATHNAME, sp, { q: null, category: null, page: null })} className="text-[15px] text-primary hover:underline">
                  Xoá tìm kiếm và bộ lọc
                </Link>
              ) : (
                <p className="max-w-md text-[15px] text-muted-foreground">
                  Khi bộ phận đào tạo mở khoá cho phép tự đăng ký, khoá sẽ hiện ở đây. Các khoá được giao cho bạn nằm ở “Khoá học của tôi”.
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {courses.map((c) => (
                <LibraryCard key={c.id} course={c} stats={stats.get(c.id)!} status={myStatus.get(c.id) ?? null} rating={ratings.get(c.id) ?? null} />
              ))}
            </div>
          )}
        </div>
        {total > PAGE_SIZE && <DataTablePagination pathname={PATHNAME} searchParams={sp} page={page} pageSize={PAGE_SIZE} total={total} />}
      </section>
    </>
  );
}
