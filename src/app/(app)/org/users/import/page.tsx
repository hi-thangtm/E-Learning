import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { getParam, type SearchParams } from "@/lib/table-params";
import { IMPORT_MAX_ROWS as MAX_ROWS } from "./types";
import { ImportWizard } from "./import-wizard";
import { formatNumber } from "@/lib/format";

export const metadata: Metadata = { title: "Import nhân viên" };

export default async function ImportUsersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";
  const sp = await searchParams;

  // Admin tập đoàn chọn công ty đang hoạt động; Admin công ty cố định công ty mình
  const companies = isGroupAdmin
    ? await prisma.company.findMany({
        where: { isActive: true },
        orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
        select: { id: true, code: true, name: true, parentId: true },
      })
    : [{ id: actor.company.id, code: actor.company.code, name: actor.company.name, parentId: actor.company.parentId }];

  const requested = getParam(sp, "company");
  const defaultCompanyId =
    (isGroupAdmin && companies.find((c) => c.id === requested)?.id) ||
    companies.find((c) => c.parentId === null)?.id ||
    companies[0]?.id ||
    actor.companyId;

  return (
    <>
      <div className="mb-6 space-y-2">
        <Link
          href="/org/users"
          className="inline-flex items-center gap-1 text-[15px] text-muted-foreground hover:text-primary"
        >
          <ChevronLeft className="size-4" />
          Người dùng
        </Link>
        <h1 className="text-2xl font-medium text-foreground">Import nhân viên từ Excel</h1>
        <p className="text-[15px] text-muted-foreground">
          Tải file mẫu, điền thông tin, tải lên để kiểm tra. Hệ thống chỉ lưu khi file không còn dòng lỗi. Tối đa{" "}
          {formatNumber(MAX_ROWS)} dòng, 5MB, định dạng .xlsx.
        </p>
      </div>
      <ImportWizard
        isGroupAdmin={isGroupAdmin}
        companies={companies.map((c) => ({ id: c.id, label: `${c.code} — ${c.name}` }))}
        defaultCompanyId={defaultCompanyId}
      />
    </>
  );
}
