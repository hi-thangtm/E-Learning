import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { StatusBadge } from "@/components/status-badge";
import { assignmentRuleScopeWhere } from "@/lib/assignment-scope";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { loadRuleFormOptions } from "../load-options";
import { RuleForm } from "../rule-form";
import { RuleStatusButton } from "../rule-row-actions";

export const metadata: Metadata = { title: "Sửa quy tắc giao tự động" };

export default async function EditRulePage({ params }: { params: Promise<{ id: string }> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const { id } = await params;

  // Phạm vi (Việc 29B #3): Admin công ty chỉ quy tắc do công ty mình tạo VÀ áp cho công ty mình; ngoài phạm vi → 404
  const rule =
    id && id.length <= 50
      ? await prisma.assignmentRule.findFirst({
          where: { id, ...assignmentRuleScopeWhere(actor) },
          select: {
            id: true,
            name: true,
            courseId: true,
            learningPathId: true,
            dueInDays: true,
            targetCompanyId: true,
            departmentId: true,
            includeSubDepartments: true,
            positionId: true,
            isActive: true,
          },
        })
      : null;
  const subjectId = rule?.courseId ?? rule?.learningPathId;
  if (!rule || !subjectId) notFound();

  const [options, notStarted] = await Promise.all([
    loadRuleFormOptions(actor, { courseId: rule.courseId, pathId: rule.learningPathId }),
    // Số lượt chưa bắt đầu của quy tắc (hộp “Tắt quy tắc” nói rõ số lượt có thể huỷ)
    prisma.enrollment.count({ where: { assignmentRuleId: rule.id, status: "NOT_STARTED" } }),
  ]);

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link href="/assign/rules" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-4" />
          Quy tắc giao tự động
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="flex min-w-0 items-center gap-3 text-2xl font-medium break-words text-foreground">
            {rule.name}
            {rule.isActive ? <StatusBadge tone="success">Đang chạy</StatusBadge> : <StatusBadge tone="secondary">Đã tắt</StatusBadge>}
          </h1>
          <RuleStatusButton rule={{ id: rule.id, name: rule.name, isActive: rule.isActive, notStarted }} />
        </div>
      </div>
      <RuleForm
        options={options}
        rule={{
          id: rule.id,
          name: rule.name,
          kind: rule.courseId ? "course" : "path",
          subjectId,
          dueInDays: rule.dueInDays ?? options.defaultDays,
          targetCompanyId: rule.targetCompanyId ?? "",
          departmentId: rule.departmentId ?? "",
          includeSubDepartments: rule.includeSubDepartments,
          positionId: rule.positionId ?? "",
          isActive: rule.isActive,
        }}
      />
    </>
  );
}
