import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, BookOpen, Building2, Clock, FileText, ListChecks, PlayCircle, RotateCcw, Route, Tag, Users, ArrowLeft, Play } from "lucide-react";
import type { ReactNode } from "react";
import { courseVersionLabel } from "@/components/course-status-badge";
import { CourseThumbnail } from "@/components/course-thumbnail";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { defaultCoverUrl } from "@/lib/course-cover";
import { requireUser } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDuration, formatNumber } from "@/lib/format";
import { getPreviewOutline } from "@/lib/learning";
import { findLibraryCourse, getCourseStats, LIBRARY_STATUS_LABELS } from "@/lib/library";
import { getPathLock } from "@/lib/path-lock";
import { cn } from "@/lib/utils";
import { getRatingSummaries } from "@/lib/reviews";
import { RatingText } from "../library-card";
import { EnrollButton } from "./enroll-button";
import { pageTitle } from "@/lib/page-title";

export async function generateMetadata({ params }: { params: Promise<{ courseId: string }> }): Promise<Metadata> {
  const user = await requireUser();
  const course = await findLibraryCourse(user, (await params).courseId, { title: true });
  return { title: pageTitle(course?.title, "Thư viện") };
}

const LESSON_ICON = { VIDEO: PlayCircle, DOCUMENT: FileText, QUIZ: ListChecks } as const;
const LESSON_TYPE_LABEL = { VIDEO: "Video", DOCUMENT: "Tài liệu", QUIZ: "Bài kiểm tra" } as const;

/** Giới thiệu khoá trong Thư viện (Việc 24): thông tin + mục lục (không học được từ đây) + nút theo tình trạng của tôi. */
export default async function LibraryCoursePage({ params }: { params: Promise<{ courseId: string }> }) {
  const user = await requireUser();
  const { courseId } = await params;

  const course = await findLibraryCourse(user, courseId, {
    id: true,
    title: true,
    description: true,
    thumbnailUrl: true,
    categoryId: true,
    currentVersion: true,
    hasCertificate: true,
    certificateValidMonths: true,
    category: { select: { name: true } },
    ownerCompany: { select: { name: true } },
  });
  if (!course) redirect("/library");

  const [outline, stats, ratings, enrollment] = await Promise.all([
    getPreviewOutline(course.id),
    getCourseStats([course.id]),
    getRatingSummaries([course.id]),
    prisma.enrollment.findFirst({
      where: { userId: user.id, courseId: course.id, status: { not: "CANCELLED" } },
      select: { status: true, learningPathId: true },
    }),
  ]);
  const completedCount = stats.get(course.id)?.completedCount ?? 0;
  const pathLock = enrollment?.learningPathId && enrollment.status !== "COMPLETED" ? await getPathLock(user.id, course.id) : null;
  const status = !enrollment ? null : enrollment.status === "COMPLETED" ? "completed" : enrollment.learningPathId ? "path" : "enrolled";
  const myHref = `/my-courses/${course.id}`;

  // Nút chính theo tình trạng của tôi
  let main: ReactNode;
  if (!enrollment) {
    main = <EnrollButton courseId={course.id} courseTitle={course.title} />;
  } else if (enrollment.status === "COMPLETED") {
    main = (
      <Link href={myHref} className={cn(buttonVariants({ variant: "outline" }), "w-full")}>
        <RotateCcw />
        Xem lại khoá học
      </Link>
    );
  } else if (pathLock) {
    main = (
      <Link href={`/learning-paths/${pathLock.pathId}`} className={cn(buttonVariants({ variant: "outline" }), "w-full")} title={pathLock.pathTitle}>
        <Route />
        <span className="truncate">Thuộc lộ trình {pathLock.pathTitle}</span>
      </Link>
    );
  } else {
    main = (
      <Link href={myHref} className={cn(buttonVariants(), "w-full")}>
        <Play />
        Vào học
      </Link>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/library" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-4" />
        Thư viện khoá học
      </Link>

      <section className="grid grid-cols-1 gap-6 rounded-md bg-card p-4 shadow-md sm:p-6 lg:grid-cols-12">
        <CourseThumbnail
          thumbnailKey={course.thumbnailUrl}
          fallbackSrc={defaultCoverUrl(course.categoryId)}
          alt={course.title}
          sizes="520px"
          className="self-start rounded-md lg:col-span-5"
        />

        <div className="flex min-w-0 flex-col gap-3 lg:col-span-7">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <Tag className="size-3.5" />
              {course.category?.name ?? "Chưa phân loại"}
            </span>
            {status && <StatusBadge tone={LIBRARY_STATUS_LABELS[status].tone}>{LIBRARY_STATUS_LABELS[status].label}</StatusBadge>}
            <span className="ml-auto text-[13px]">
              <RatingText rating={ratings.get(course.id) ?? null} />
            </span>
          </div>
          <h1 className="text-2xl font-medium text-foreground">{course.title}</h1>
          {course.description ? (
            <p className="text-[15px] whitespace-pre-line text-muted-foreground">{course.description}</p>
          ) : (
            <p className="text-[15px] text-muted-foreground italic">Khoá học chưa có mô tả.</p>
          )}

          <dl className="grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-3 text-[13px]">
            <Fact icon={<Building2 className="size-4" />} label="Công ty sở hữu" value={course.ownerCompany.name} />
            <Fact icon={<Tag className="size-4" />} label="Phiên bản" value={courseVersionLabel(course.currentVersion)} />
            <Fact icon={<BookOpen className="size-4" />} label="Số bài học" value={`${formatNumber(outline.totalLessons)} bài`} />
            <Fact
              icon={<Clock className="size-4" />}
              label="Thời lượng video"
              value={outline.totalVideoSeconds > 0 ? formatDuration(outline.totalVideoSeconds) : "Không có video"}
            />
            <Fact icon={<Users className="size-4" />} label="Đã hoàn thành" value={`${formatNumber(completedCount)} người`} />
            <Fact
              icon={<Award className="size-4" />}
              label="Chứng nhận"
              value={
                !course.hasCertificate
                  ? "Không cấp"
                  : course.certificateValidMonths
                    ? `Có — hiệu lực ${course.certificateValidMonths} tháng`
                    : "Có — vĩnh viễn"
              }
            />
          </dl>

          <div className="mt-auto flex flex-col gap-2 pt-2 sm:flex-row sm:items-center sm:gap-4">
            <div className="w-full sm:w-64">{main}</div>
            {!enrollment && <p className="text-[13px] text-muted-foreground">Không có hạn hoàn thành — học theo nhịp của bạn.</p>}
            {pathLock && (
              <p className="text-[13px] text-muted-foreground">
                Hoàn thành <span className="font-medium text-foreground">{pathLock.blockedBy.title}</span> để mở khoá này.
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-md bg-card shadow-md">
        <header className="p-6 pb-4">
          <h2 className="text-lg font-medium text-foreground">Nội dung khoá học</h2>
          <p className="text-[13px] text-muted-foreground">
            {formatNumber(outline.sections.length)} chương · {formatNumber(outline.totalLessons)} bài{!enrollment && " — đăng ký để bắt đầu học"}.
          </p>
        </header>
        {outline.totalLessons === 0 ? (
          <p className="px-6 pb-6 text-[15px] text-muted-foreground">Khoá học chưa có bài học nào.</p>
        ) : (
          <div className="border-t border-border">
            {outline.sections.map((s, i) => (
              <div key={s.id} className="border-b border-border last:border-0">
                <p className="flex items-center justify-between gap-4 bg-muted/40 px-6 py-3 font-medium text-foreground">
                  <span className="truncate">
                    Chương {i + 1}: {s.title}
                  </span>
                  <span className="shrink-0 text-[13px] font-normal text-muted-foreground">{s.lessons.length} bài</span>
                </p>
                <ul>
                  {s.lessons.map((l) => {
                    const Icon = LESSON_ICON[l.type];
                    return (
                      <li key={l.id} className="flex items-center gap-3 px-6 py-3 pl-10">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/16 text-primary">
                          <Icon className="size-4" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-foreground">{l.title}</span>
                        <span className="shrink-0 text-[13px] text-muted-foreground">
                          {LESSON_TYPE_LABEL[l.type]}
                          {l.durationSeconds ? ` · ${formatDuration(l.durationSeconds)}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Fact({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      {/* Giá trị xuống dòng thay vì cắt — title không xem được trên cảm ứng (ui-review #9) */}
      <dd className="mt-1 flex items-start gap-1.5 font-medium text-foreground">
        <span className="mt-px shrink-0">{icon}</span>
        <span className="min-w-0 break-words">{value}</span>
      </dd>
    </div>
  );
}
