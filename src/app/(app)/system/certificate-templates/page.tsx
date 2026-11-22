import type { Metadata } from "next";
import { Info } from "lucide-react";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { PageHeader } from "@/components/page-header";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/table-params";
import { TemplateForm, type TemplateValue } from "./template-form";

export const metadata: Metadata = { title: "Mẫu chứng nhận" };

const SELECT = {
  id: true,
  code: true,
  name: true,
  parentId: true,
  logoUrl: true,
  certificateSignerName: true,
  certificateSignerTitle: true,
  certificateSignatureUrl: true,
} as const;

function toValue(c: { logoUrl: string | null; certificateSignerName: string | null; certificateSignerTitle: string | null; certificateSignatureUrl: string | null }): TemplateValue {
  return {
    logoKey: c.logoUrl,
    signerName: c.certificateSignerName ?? "",
    signerTitle: c.certificateSignerTitle ?? "",
    signatureKey: c.certificateSignatureUrl,
  };
}

/**
 * Mẫu chứng nhận theo công ty (feature-spec 5.6 / 6.4).
 * Admin tập đoàn: chọn công ty (mặc định công ty tổng = mẫu mặc định cho mọi công ty). Admin công ty: công ty mình.
 */
export default async function CertificateTemplatesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const sp = await searchParams;

  const companies = isGroupAdmin
    ? await prisma.company.findMany({ orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }], select: SELECT })
    : await prisma.company.findMany({ where: { OR: [{ id: actor.companyId }, { parentId: null }] }, select: SELECT });

  const group = companies.find((c) => c.parentId === null) ?? null;
  const company = isGroupAdmin
    ? (companies.find((c) => c.id === getParam(sp, "company")) ?? group ?? companies[0])
    : companies.find((c) => c.id === actor.companyId)!;
  const isGroup = company.parentId === null;

  return (
    <>
      <PageHeader
        title="Mẫu chứng nhận"
        description="Logo, người ký và chữ ký in trên chứng nhận PDF của nhân viên công ty."
      />

      <p className="mb-6 flex items-start gap-2 rounded-md bg-info/16 px-4 py-3 text-[15px] text-info">
        <Info className="mt-0.5 size-5 shrink-0" />
        <span>
          Mẫu chỉ áp dụng cho chứng nhận cấp <strong className="font-medium">SAU khi lưu</strong> — chứng nhận đã cấp giữ nguyên mẫu tại thời điểm cấp.
          {isGroup
            ? " Mẫu của công ty tổng là mẫu mặc định: công ty con để trống mục nào sẽ dùng mục đó của công ty tổng."
            : " Mục nào để trống sẽ dùng của công ty tổng."}
        </span>
      </p>

      <section className="rounded-md bg-card p-6 shadow-md">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-foreground">
              {company.code} — {company.name}
            </h2>
            <p className="text-[13px] text-muted-foreground">{isGroup ? "Công ty tổng (mẫu mặc định)" : "Công ty con"}</p>
          </div>
          {isGroupAdmin && (
            <div className="w-80">
              <DataTableFilter
                param="company"
                label="Công ty"
                includeAll={false}
                defaultValue={company.id}
                options={companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` }))}
              />
            </div>
          )}
        </div>

        <TemplateForm
          key={company.id}
          companyId={company.id}
          value={toValue(company)}
          fallback={!isGroup && group ? { ...toValue(group), companyName: group.name } : null}
        />
      </section>
    </>
  );
}
