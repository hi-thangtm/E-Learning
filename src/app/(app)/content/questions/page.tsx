import type { Metadata } from "next";
import Link from "next/link";
import { Download, FileUp, ImageIcon, ListChecks, Plus } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { canEditCourse, COURSE_STATUS_LABELS, courseVisibleWhere } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime, formatNumber } from "@/lib/format";
import { getTopicStats, parseOptions } from "@/lib/question-bank";
import { NO_TOPIC, QUESTION_TYPE_LABELS, topicLabel } from "@/lib/question-labels";
import { buildHref, getEnumParam, getParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { CourseSelect } from "./course-select";
import { QuestionFormDialog } from "./question-form-dialog";
import { QuestionRowActions } from "./question-row-actions";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Ngân hàng câu hỏi" };

const PATHNAME = "/content/questions";
const TYPE_VALUES = ["SINGLE", "MULTIPLE"] as const;
const STATUS_VALUES = ["active", "pending", "inactive"] as const;
/** Lọc khớp đúng nhãn ở cột Trạng thái: Đang dùng / Chờ duyệt / Đã tắt (ui-review #43) */
const STATUS_WHERE: Record<(typeof STATUS_VALUES)[number], Prisma.QuestionWhereInput> = {
  active: { isActive: true, isApproved: true },
  pending: { isApproved: false },
  inactive: { isActive: false, isApproved: true },
};

export default async function QuestionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const sp = await searchParams;

  // Khoá trong phạm vi xem (Quy tắc 1): công ty con thấy khoá của mình + khoá đã phát hành của công ty tổng
  const scope = await courseVisibleWhere(actor);
  const courses = await prisma.course.findMany({
    where: scope,
    orderBy: [{ title: "asc" }],
    select: { id: true, code: true, title: true, status: true, ownerCompanyId: true, currentVersion: true },
  });
  const course = courses.find((c) => c.id === getParam(sp, "course")) ?? null;

  const courseOptions = courses.map((c) => ({
    id: c.id,
    code: c.code,
    title: c.title,
    statusLabel: COURSE_STATUS_LABELS[c.status],
  }));

  const header = (
    <>
      <PageHeader
        title="Ngân hàng câu hỏi"
        description="Câu hỏi theo từng khoá học — bài kiểm tra rút ngẫu nhiên từ đây theo chủ đề."
      />
      <div className="mb-6 flex items-center gap-4 rounded-md bg-card p-6 shadow-md">
        <span className="shrink-0 text-[15px] font-medium text-foreground">Khoá học</span>
        <div className="w-full max-w-xl">
          <CourseSelect courses={courseOptions} value={course?.id ?? null} />
        </div>
        {course && (
          <Link
            href={`/content/courses/${course.id}?tab=content`}
            className="shrink-0 text-[15px] text-primary hover:underline"
          >
            Mở trang soạn khoá
          </Link>
        )}
      </div>
    </>
  );

  if (!course) {
    return (
      <>
        {header}
        <EmptyState
          icon={ListChecks}
          title="Chọn khoá học để xem ngân hàng câu hỏi"
          description={
            courses.length > 0
              ? "Mỗi khoá học có ngân hàng câu hỏi riêng. Chọn khoá ở ô phía trên."
              : "Chưa có khoá học nào trong phạm vi của bạn. Tạo khoá học trước ở mục Soạn nội dung › Khoá học."
          }
          className="rounded-md bg-card shadow-md"
        />
      </>
    );
  }

  const canEdit = canEditCourse(actor, course);
  const canDelete = canEdit && course.currentVersion === 0;

  const { q, page, pageSize, skip, take } = parseTableParams(sp);
  const type = getEnumParam(sp, "type", TYPE_VALUES);
  const status = getEnumParam(sp, "status", STATUS_VALUES);

  const stats = await getTopicStats(course.id);
  // Chủ đề lọc được = mọi chủ đề có câu (kể cả câu đã tắt)
  const allTopics = (
    await prisma.question.groupBy({ by: ["topic"], where: { courseId: course.id }, orderBy: { topic: "asc" } })
  ).map((g) => g.topic);
  const topicParam = getParam(sp, "topic");
  const topic =
    topicParam === NO_TOPIC ? NO_TOPIC : allTopics.find((t) => t !== null && t === topicParam) ?? undefined;

  const where: Prisma.QuestionWhereInput = {
    courseId: course.id,
    ...(q && { content: { contains: q, mode: "insensitive" } }),
    ...(topic && { topic: topic === NO_TOPIC ? null : topic }),
    ...(type && { type }),
    ...(status && STATUS_WHERE[status]),
  };

  const [total, questions] = await prisma.$transaction([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip,
      take,
      select: {
        id: true,
        topic: true,
        type: true,
        content: true,
        imageUrl: true,
        options: true,
        explanation: true,
        isActive: true,
        isApproved: true,
        updatedAt: true,
      },
    }),
  ]);

  const topicNames = allTopics.filter((t): t is string => t !== null);
  type Row = (typeof questions)[number];

  const columns: DataTableColumn<Row>[] = [
    {
      key: "content",
      header: "Nội dung",
      className: "min-w-80 whitespace-normal",
      cell: (r) => (
        <div className="flex items-start gap-2 py-2">
          <p className="line-clamp-2 whitespace-pre-line text-foreground" title={r.content}>
            {r.content}
          </p>
          {r.imageUrl && <ImageIcon className="mt-1 size-4 shrink-0 text-info" aria-label="Có ảnh minh hoạ" />}
        </div>
      ),
    },
    {
      key: "topic",
      header: "Chủ đề",
      className: "max-w-48 truncate",
      cell: (r) => (r.topic ? <span title={r.topic}>{r.topic}</span> : <span className="text-foreground/45">—</span>),
    },
    { key: "type", header: "Loại", className: "w-36", cell: (r) => QUESTION_TYPE_LABELS[r.type] },
    {
      key: "options",
      header: "Số phương án",
      className: "w-32 text-right",
      cell: (r) => formatNumber(parseOptions(r.options).length),
    },
    {
      key: "status",
      header: "Trạng thái",
      className: "w-32",
      cell: (r) =>
        r.isActive && r.isApproved ? (
          <StatusBadge tone="success">Đang dùng</StatusBadge>
        ) : !r.isApproved ? (
          <StatusBadge tone="warning">Chờ duyệt</StatusBadge>
        ) : (
          <StatusBadge tone="secondary">Đã tắt</StatusBadge>
        ),
    },
    { key: "updatedAt", header: "Cập nhật lần cuối", className: "w-44", cell: (r) => formatDateTime(r.updatedAt) },
  ];

  if (canEdit) {
    columns.push({
      key: "actions",
      header: "Thao tác",
      className: "w-32 text-right",
      cell: (r) => (
        <QuestionRowActions
          courseId={course.id}
          isActive={r.isActive}
          canDelete={canDelete}
          topics={topicNames}
          question={{
            id: r.id,
            content: r.content,
            topic: r.topic ?? "",
            type: r.type,
            imageKey: r.imageUrl,
            options: parseOptions(r.options),
            explanation: r.explanation ?? "",
          }}
        />
      ),
    });
  }

  const addButton = canEdit ? (
    <QuestionFormDialog
      courseId={course.id}
      topics={topicNames}
      trigger={
        <Button>
          <Plus />
          Thêm câu hỏi
        </Button>
      }
    />
  ) : null;

  const courseHref = `${PATHNAME}?course=${course.id}`;
  const chipHref = (value: string | null) => buildHref(PATHNAME, sp, { topic: value, page: null });

  return (
    <>
      {header}

      {!canEdit && (
        <p className="mb-6 rounded-md bg-muted px-4 py-3 text-[13px] text-muted-foreground">
          Khoá học này thuộc công ty khác — bạn chỉ được xem câu hỏi, không thêm / sửa / xuất được.
        </p>
      )}

      {/* Thanh tổng hợp: số câu đang dùng + chip theo chủ đề (bấm để lọc) */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md bg-card px-6 py-4 shadow-md">
        <p className="mr-2 text-[15px] text-foreground">
          Đang dùng: <span className="font-medium">{formatNumber(stats.total)} câu</span>
        </p>
        {stats.topics.length === 0 ? (
          <span className="text-[13px] text-muted-foreground">Chưa có câu hỏi nào đang dùng.</span>
        ) : (
          stats.topics.map((t) => {
            const value = t.topic ?? NO_TOPIC;
            const active = topic === value;
            return (
              <Link
                key={value}
                href={chipHref(active ? null : value)}
                aria-pressed={active}
                className={cn(
                  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium whitespace-nowrap transition-colors",
                  active
                    ? "bg-primary text-primary-foreground shadow-primary-sm"
                    : "bg-primary/16 text-primary hover:bg-primary/24",
                )}
              >
                {topicLabel(t.topic)}
                <span className={cn("inline-flex shrink-0 items-center rounded-full px-1.5 text-[12px] whitespace-nowrap tabular-nums", active ? "bg-white/20" : "bg-card")}>
                  {formatNumber(t.count)}
                </span>
              </Link>
            );
          })
        )}
      </div>

      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        clearHref={courseHref}
        columns={columns}
        rows={questions}
        rowKey={(r) => r.id}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm theo nội dung..."
        filters={[
          {
            param: "topic",
            label: "Chủ đề",
            allLabel: "Tất cả chủ đề",
            options: [
              ...topicNames.map((t) => ({ value: t, label: t })),
              ...(allTopics.includes(null) ? [{ value: NO_TOPIC, label: "Không có chủ đề" }] : []),
            ],
          },
          {
            param: "type",
            label: "Loại",
            allLabel: "Tất cả loại",
            options: TYPE_VALUES.map((t) => ({ value: t, label: QUESTION_TYPE_LABELS[t] })),
          },
          {
            param: "status",
            label: "Trạng thái",
            allLabel: "Tất cả trạng thái",
            options: [
              { value: "active", label: "Đang dùng" },
              { value: "pending", label: "Chờ duyệt" },
              { value: "inactive", label: "Đã tắt" },
            ],
          },
        ]}
        toolbar={
          <>
            {/* File xuất có đáp án đúng + giải thích → chỉ người được SỬA khoá (Việc 29B #1) */}
            {canEdit && (
              <>
                <a
                  href={`${PATHNAME}/export?course=${course.id}`}
                  className={buttonVariants({ variant: "outline" })}
                  download
                >
                  <Download />
                  Xuất Excel
                </a>
                <Link href={`${PATHNAME}/import?course=${course.id}`} className={buttonVariants({ variant: "outline" })}>
                  <FileUp />
                  Import câu hỏi
                </Link>
              </>
            )}
            {addButton}
          </>
        }
        empty={{
          title: "Khoá học chưa có câu hỏi nào",
          description: canEdit
            ? "Thêm câu hỏi từng câu, hoặc import nhiều câu từ file Excel."
            : "Công ty sở hữu khoá học chưa soạn câu hỏi.",
          action: addButton,
        }}
      />
    </>
  );
}
