import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, TriangleAlert } from "lucide-react";
import { LessonBody } from "@/components/learning/lesson-body";
import { LessonShell } from "@/components/learning/lesson-shell";
import { getLessonDetail, getPreviewOutline } from "@/lib/learning";
import { canEditCourse, findCourseInScope } from "@/lib/course-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { isBunnyConfigured } from "@/lib/bunny";
import { ACTIVE_QUESTION_WHERE, getQuizBankIssues, getTopicStats } from "@/lib/question-bank";
import { getSetting } from "@/lib/settings";
import { canManageMajor, canProposeMajor, canPublishMinor, isUpdatable } from "@/lib/versioning";
import { isBlankHtml } from "@/lib/sanitize";
import { getParam, type SearchParams } from "@/lib/table-params";
import { ContentEditor } from "./content-editor";
import type { ContentSection } from "./content-types";
import { CourseHeader } from "./course-header";
import { CourseInfoForm } from "./course-info-form";
import { CourseReviews } from "./course-reviews";
import { COURSE_TABS, CourseTabs, type CourseTab } from "./course-tabs";
import { ProposalBanner } from "./proposal-banner";
import { VersionHistory } from "./version-history";

export const metadata: Metadata = { title: "Soạn khoá học" };


export default async function CourseEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const { id } = await params;
  const sp = await searchParams;

  // Phạm vi (Quy tắc 1): ngoài phạm vi -> về danh sách
  const course = await findCourseInScope(actor, id, {
    id: true,
    code: true,
    title: true,
    description: true,
    categoryId: true,
    thumbnailUrl: true,
    allowSelfEnroll: true,
    hasCertificate: true,
    certificateValidMonths: true,
    status: true,
    currentVersion: true,
    ownerCompanyId: true,
    ownerCompany: { select: { code: true, name: true } },
  });
  if (!course) redirect("/content/courses");

  const canEdit = canEditCourse(actor, course);
  const tabParam = getParam(sp, "tab");
  const tab: CourseTab = COURSE_TABS.find((t) => t === tabParam) ?? "info";

  // Danh mục chọn được: đang dùng + danh mục hiện tại của khoá (kể cả đã ẩn)
  const categories =
    tab === "info"
      ? await prisma.courseCategory.findMany({
          where: { OR: [{ isActive: true }, ...(course.categoryId ? [{ id: course.categoryId }] : [])] },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true, isActive: true },
        })
      : [];

  // Tab Nội dung: mọi chương + bài (kể cả đã ẩn) theo thứ tự
  const sections: ContentSection[] =
    tab === "content"
      ? (
          await prisma.courseSection.findMany({
            where: { courseId: course.id },
            orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
            select: {
              id: true,
              title: true,
              isArchived: true,
              lessons: {
                orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
                select: {
                  id: true,
                  title: true,
                  type: true,
                  isArchived: true,
                  content: true,
                  fileUrl: true,
                  fileName: true,
                  videoProvider: true,
                  videoId: true,
                  videoStatus: true,
                  durationSeconds: true,
                  minWatchPercent: true,
                  questionTopic: true,
                  questionCount: true,
                  passingScore: true,
                  timeLimitMinutes: true,
                  maxAttempts: true,
                  showAnswers: true,
                },
              },
            },
          })
        ).map((s) => ({
          id: s.id,
          title: s.title,
          isArchived: s.isArchived,
          lessons: s.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            type: l.type,
            isArchived: l.isArchived,
            content: l.content && !isBlankHtml(l.content) ? l.content : "",
            fileKey: l.fileUrl,
            fileName: l.fileName,
            minWatchPercent: l.minWatchPercent,
            videoProvider: l.videoProvider,
            videoId: l.videoId,
            videoStatus: l.videoStatus,
            durationSeconds: l.durationSeconds,
            questionTopic: l.questionTopic ?? "",
            questionCount: l.questionCount,
            passingScore: l.passingScore,
            timeLimitMinutes: l.timeLimitMinutes,
            maxAttempts: l.maxAttempts,
            showAnswers: l.showAnswers,
          })),
        }))
      : [];
  const published = course.currentVersion > 0;

  // Ngân hàng câu hỏi: số câu đang dùng (nút ở thanh trên) + thống kê chủ đề và lỗi bài kiểm tra (tab Nội dung)
  const [activeQuestions, questionBank] = await Promise.all([
    prisma.question.count({ where: { courseId: course.id, ...ACTIVE_QUESTION_WHERE } }),
    tab === "content" ? getTopicStats(course.id) : Promise.resolve(null),
  ]);
  // getQuizBankIssues dùng chung với bước phát hành (Việc 21)
  const quizIssues = questionBank ? await getQuizBankIssues(course.id, questionBank) : [];

  // Tab Xem trước: như học viên thấy (bỏ bài / chương ẩn), mở mọi bài, không ghi tiến độ
  const previewOutline = tab === "preview" ? await getPreviewOutline(course.id) : null;
  const previewLessons = previewOutline?.sections.flatMap((s) => s.lessons) ?? [];
  const previewLessonId = (previewLessons.find((l) => l.id === getParam(sp, "lesson")) ?? previewLessons[0])?.id;
  const previewLesson = previewLessonId ? await getLessonDetail(previewLessonId) : null;

  // Bản cập nhật MINOR / MAJOR (Việc 21A): quyền + đề xuất MAJOR đang chờ duyệt
  const [pendingProposal, defaultDueDays] = await Promise.all([
    prisma.courseVersion.findFirst({
      where: { courseId: course.id, status: "PROPOSED" },
      orderBy: { proposedAt: "desc" },
      select: { id: true, changeSummary: true, dueInDays: true, proposedAt: true, createdAt: true, proposedBy: { select: { fullName: true } } },
    }),
    getSetting("DEFAULT_DUE_DAYS"),
  ]);
  const update = {
    updatable: isUpdatable(course),
    allowMinor: canPublishMinor(actor, course),
    allowMajor: canManageMajor(actor, course),
    allowPropose: canProposeMajor(actor, course),
    majorBlockedReason: pendingProposal && canProposeMajor(actor, course) ? "Khoá đang có 1 đề xuất MAJOR chờ duyệt." : null,
    defaultDueDays,
  };

  return (
    <>
      <CourseHeader course={course} canEdit={canEdit} questionCount={activeQuestions} update={update} />

      {pendingProposal && (
        <ProposalBanner
          course={{ id: course.id, code: course.code, title: course.title }}
          canManage={update.allowMajor}
          proposal={{
            id: pendingProposal.id,
            proposerName: pendingProposal.proposedBy?.fullName ?? "Không rõ",
            proposedAt: (pendingProposal.proposedAt ?? pendingProposal.createdAt).toISOString(),
            summaryHtml: pendingProposal.changeSummary ?? "",
            dueInDays: pendingProposal.dueInDays ?? defaultDueDays,
          }}
        />
      )}

      <section className="rounded-md bg-card shadow-md">
        <CourseTabs courseId={course.id} active={tab} />
        <div className="p-6">
          {tab === "info" ? (
            <CourseInfoForm
              readOnly={!canEdit}
              categories={categories}
              course={{
                id: course.id,
                code: course.code,
                title: course.title,
                description: course.description ?? "",
                categoryId: course.categoryId ?? "",
                thumbnailKey: course.thumbnailUrl,
                allowSelfEnroll: course.allowSelfEnroll,
                hasCertificate: course.hasCertificate,
                certificateValidMonths: course.certificateValidMonths?.toString() ?? "",
              }}
            />
          ) : tab === "content" ? (
            <div className="grid gap-4">
              {published && (
                <p role="status" className="flex items-start gap-2 rounded-md bg-warning/16 px-4 py-3 text-[15px] text-warning">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0" />
                  Khoá đã phát hành — sửa xong, hãy Phát hành bản cập nhật để báo cho người học.
                </p>
              )}
              {quizIssues.length > 0 && (
                <div role="status" className="flex items-start gap-2 rounded-md bg-warning/16 px-4 py-3 text-[15px] text-warning">
                  <TriangleAlert className="mt-0.5 size-5 shrink-0" />
                  <div className="space-y-1">
                    <p className="font-medium">Bài kiểm tra cần xử lý trước khi phát hành</p>
                    <ul className="list-disc space-y-0.5 pl-5 text-[13px]">
                      {quizIssues.map((issue) => (
                        <li key={issue}>{issue}</li>
                      ))}
                    </ul>
                    <Link href={`/content/questions?course=${course.id}`} className="inline-block text-[13px] font-medium underline underline-offset-2">
                      Mở ngân hàng câu hỏi
                    </Link>
                  </div>
                </div>
              )}
              {!canEdit && (
                <p className="rounded-md bg-muted px-4 py-3 text-[13px] text-muted-foreground">
                  Khoá học này thuộc công ty khác — bạn chỉ được xem nội dung, không sửa hay sắp xếp được.
                </p>
              )}
              <ContentEditor
                courseId={course.id}
                sections={sections}
                readOnly={!canEdit}
                published={published}
                bunnyEnabled={isBunnyConfigured()}
                questionBank={questionBank ?? { total: 0, topics: [] }}
              />
            </div>
          ) : tab === "versions" ? (
            <VersionHistory courseId={course.id} />
          ) : tab === "preview" ? (
            previewOutline && previewLesson ? (
              <div className="-m-6 overflow-hidden rounded-b-md">
                <LessonShell
                  key={previewLesson.id}
                  mode="preview"
                  course={{ id: course.id, title: course.title }}
                  sections={previewOutline.sections}
                  progressPercent={0}
                  currentLessonId={previewLesson.id}
                  lessonHrefs={Object.fromEntries(
                    previewLessons.map((l) => [l.id, `/content/courses/${course.id}?tab=preview&lesson=${l.id}`]),
                  )}
                  backHref={`/content/courses/${course.id}?tab=content`}
                  backLabel="Về soạn nội dung"
                >
                  <LessonBody lesson={previewLesson} />
                </LessonShell>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-primary/16 text-primary">
                  <Eye className="size-8" />
                </div>
                <p className="text-lg font-medium text-foreground">Khoá học chưa có bài nào để xem trước</p>
                <p className="max-w-sm text-[15px] text-muted-foreground">
                  Thêm chương và bài ở tab Nội dung (bài / chương đang ẩn không hiện với học viên).
                </p>
              </div>
            )
          ) : (
            <CourseReviews actor={actor} courseId={course.id} searchParams={sp} />
          )}
        </div>
      </section>
    </>
  );
}
