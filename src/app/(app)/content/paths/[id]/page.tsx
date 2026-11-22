import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { countPathLearners } from "@/lib/assignment";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { canEditPath, findPathInScope, selectableCoursesWhere } from "@/lib/path-scope";
import { PathEditor, type PathCourseRow, type SelectableCourse } from "./path-editor";

export const metadata: Metadata = { title: "Soạn lộ trình" };

/** Trang soạn lộ trình: thông tin + danh sách khoá có thứ tự (Việc 23A). */
export default async function PathEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const { id } = await params;

  const path = await findPathInScope(actor, id, {
    id: true,
    code: true,
    title: true,
    description: true,
    status: true,
    ownerCompanyId: true,
    ownerCompany: { select: { code: true, name: true } },
    courses: {
      orderBy: { sortOrder: "asc" },
      select: {
        course: {
          select: { id: true, code: true, title: true, status: true, thumbnailUrl: true, ownerCompany: { select: { code: true } } },
        },
      },
    },
  });
  if (!path) redirect("/content/paths");

  const canEdit = canEditPath(actor, path);
  const courseIds = path.courses.map((c) => c.course.id);

  // Số bài + tổng thời lượng video (bài / chương đang dùng)
  const [lessons, learnerCount, selectable] = await Promise.all([
    courseIds.length
      ? prisma.lesson.findMany({
          where: { isArchived: false, section: { courseId: { in: courseIds }, isArchived: false } },
          select: { durationSeconds: true, section: { select: { courseId: true } } },
        })
      : [],
    countPathLearners(path.id),
    canEdit && path.status !== "ARCHIVED"
      ? prisma.course.findMany({
          where: { AND: [await selectableCoursesWhere(path), { id: { notIn: courseIds } }] },
          orderBy: { code: "asc" },
          select: { id: true, code: true, title: true, ownerCompany: { select: { code: true } } },
        })
      : [],
  ]);
  const stats = new Map<string, { lessons: number; seconds: number }>();
  for (const l of lessons) {
    const s = stats.get(l.section.courseId) ?? { lessons: 0, seconds: 0 };
    s.lessons++;
    s.seconds += l.durationSeconds ?? 0;
    stats.set(l.section.courseId, s);
  }

  const rows: PathCourseRow[] = path.courses.map(({ course }) => ({
    id: course.id,
    code: course.code,
    title: course.title,
    status: course.status,
    thumbnailUrl: course.thumbnailUrl,
    ownerCode: course.ownerCompany.code,
    lessonCount: stats.get(course.id)?.lessons ?? 0,
    videoSeconds: stats.get(course.id)?.seconds ?? 0,
  }));
  const options: SelectableCourse[] = selectable.map((c) => ({ id: c.id, code: c.code, title: c.title, ownerCode: c.ownerCompany.code }));

  return (
    <PathEditor
      path={{
        id: path.id,
        code: path.code,
        title: path.title,
        description: path.description,
        status: path.status,
        ownerCompany: path.ownerCompany,
      }}
      canEdit={canEdit}
      learnerCount={learnerCount}
      courses={rows}
      selectable={options}
    />
  );
}
