import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { getParam, type SearchParams } from "@/lib/table-params";
import { loadRuleFormOptions } from "../load-options";
import { RuleForm } from "../rule-form";

export const metadata: Metadata = { title: "Tạo quy tắc giao tự động" };

export default async function NewRulePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const sp = await searchParams;
  const options = await loadRuleFormOptions(actor);
  // ?courseId= từ bước 2 của trình giao khoá — chỉ nhận khoá giao được
  const requested = getParam(sp, "courseId");
  const initialCourseId = options.courses.find((c) => c.id === requested && c.published)?.id ?? null;

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link href="/assign/rules" className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary">
          <ChevronLeft className="size-4" />
          Giao tự động
        </Link>
        <h1 className="text-2xl font-medium text-foreground">Tạo quy tắc giao tự động</h1>
        <p className="text-[15px] text-muted-foreground">
          Giao khoá cho cả một nhóm (công ty / phòng ban / chức danh), kể cả người vào nhóm sau này.
        </p>
      </div>
      <RuleForm options={options} initialCourseId={initialCourseId} />
    </>
  );
}
