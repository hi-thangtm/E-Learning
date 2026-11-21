import type { Metadata } from "next";
import { FileDown } from "lucide-react";
import { AuditDetailSheet } from "@/components/audit/audit-detail-sheet";
import { auditLogColumns } from "@/components/audit/audit-columns";
import { DataTable, type DataTableFilterConfig } from "@/components/data-table/data-table";
import { DateRangeFilter } from "@/components/data-table/date-range-filter";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { AUDIT_GROUP_LABELS, ENTITY_LABELS } from "@/lib/audit";
import {
  AUDIT_ENTITY_VALUES,
  AUDIT_GROUP_VALUES,
  AUDIT_LOG_SELECT,
  buildAuditWhere,
  DEFAULT_RANGE_DAYS,
  enrichAuditLogs,
  getAuditLogDetail,
} from "@/lib/audit-query";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatNumber } from "@/lib/format";
import { buildHref, getParam, parseTableParams, type SearchParams } from "@/lib/table-params";

export const metadata: Metadata = { title: "Nhật ký thao tác" };

const PATHNAME = "/system/audit-logs";

/** Nhật ký thao tác — CHỈ ĐỌC (không có sửa / xoá ở bất kỳ đâu). */
export default async function AuditLogsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const isGroupAdmin = actor.role === "GROUP_ADMIN";

  const sp = await searchParams;
  const { page, pageSize, skip, take } = parseTableParams(sp);
  const { where, filters } = buildAuditWhere(actor, sp);

  const [[total, logs], companies, detail] = await Promise.all([
    prisma.$transaction([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take,
        select: AUDIT_LOG_SELECT,
      }),
    ]),
    isGroupAdmin
      ? prisma.company.findMany({
          orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
          select: { id: true, code: true, name: true },
        })
      : Promise.resolve([]),
    getAuditLogDetail(actor, getParam(sp, "log")),
  ]);

  const rows = await enrichAuditLogs(actor, logs);

  const filterConfigs: DataTableFilterConfig[] = [];
  if (isGroupAdmin) {
    filterConfigs.push({
      param: "company",
      label: "Công ty",
      allLabel: "Tất cả công ty",
      options: companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
    });
  }
  filterConfigs.push(
    {
      param: "group",
      label: "Nhóm thao tác",
      allLabel: "Tất cả thao tác",
      options: AUDIT_GROUP_VALUES.map((g) => ({ value: g, label: AUDIT_GROUP_LABELS[g] })),
    },
    {
      param: "entity",
      label: "Loại đối tượng",
      allLabel: "Tất cả đối tượng",
      options: AUDIT_ENTITY_VALUES.map((e) => ({ value: e, label: ENTITY_LABELS[e] })),
    },
  );

  // Xuất Excel theo đúng bộ lọc đang xem (bỏ trang / panel)
  const exportHref = buildHref(`${PATHNAME}/export`, sp, { page: null, pageSize: null, log: null });

  return (
    <>
      <PageHeader
        title="Nhật ký thao tác"
        description={
          isGroupAdmin
            ? "Ai đã làm gì, lúc nào trên toàn hệ thống. Nhật ký chỉ đọc, không sửa hay xoá được."
            : `Ai đã làm gì, lúc nào trong ${actor.company.name}. Nhật ký chỉ đọc, không sửa hay xoá được.`
        }
      />
      <DataTable
        pathname={PATHNAME}
        searchParams={sp}
        columns={auditLogColumns({ showCompany: isGroupAdmin })}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => buildHref(PATHNAME, sp, { log: r.id })}
        total={total}
        page={page}
        pageSize={pageSize}
        searchPlaceholder="Tìm người thực hiện (tên, mã NV)..."
        filters={filterConfigs}
        extraFilters={<DateRangeFilter key={`${filters.from}-${filters.to}`} from={filters.from} to={filters.to} />}
        extraFilterParams={["from", "to"]}
        toolbar={
          <a
            href={exportHref}
            className={buttonVariants({ variant: "outline" })}
            title={`Xuất ${formatNumber(Math.min(total, 10_000))} dòng theo bộ lọc hiện tại`}
          >
            <FileDown />
            Xuất Excel
          </a>
        }
        empty={{
          title: "Chưa có nhật ký",
          description: `Không có thao tác nào trong khoảng thời gian này (mặc định ${DEFAULT_RANGE_DAYS} ngày gần nhất).`,
        }}
      />
      <AuditDetailSheet detail={detail} closeHref={buildHref(PATHNAME, sp, { log: null })} />
    </>
  );
}
