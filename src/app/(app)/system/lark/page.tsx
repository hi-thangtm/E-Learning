import type { Metadata } from "next";
import { History } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { describeAuditEntry } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { getLarkSettingsView, isLarkConfigured } from "@/lib/lark/client";
import { getLarkNames } from "@/lib/lark/names";
import { LarkCredentialsForm } from "./lark-credentials-form";
import { LarkMapping } from "./lark-mapping";
import { LarkSyncPanel } from "./lark-sync-panel";

export const metadata: Metadata = { title: "Kết nối Lark" };

/** Kết nối Lark (Việc L1) — chỉ Admin tập đoàn: trạng thái, ghép công ty ↔ phòng ban Lark, chạy thử / áp dụng đồng bộ, lịch sử. */
export default async function LarkPage() {
  await requireRole(["GROUP_ADMIN"]);
  const [configured, view] = await Promise.all([isLarkConfigured(), getLarkSettingsView()]);
  const [companies, names, history] = await Promise.all([
    prisma.company.findMany({
      orderBy: [{ parentId: { sort: "asc", nulls: "first" } }, { code: "asc" }],
      select: { id: true, code: true, name: true, isActive: true, larkDepartmentId: true },
    }),
    getLarkNames(),
    prisma.auditLog.findMany({
      where: { action: "LARK_SYNC_RUN" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, createdAt: true, metadata: true, actor: { select: { fullName: true, employeeCode: true } } },
    }),
  ]);
  const mapped = companies.filter((c) => c.larkDepartmentId).length;
  const applied = history.some((h) => {
    const m = h.metadata as { trigger?: string; applied?: boolean } | null;
    return m?.trigger === "manual" && m.applied === true;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kết nối Lark"
        description="Đồng bộ nhân viên, phòng ban, trưởng phòng từ Lark. Lark là nguồn chính cho họ tên, email, điện thoại, phòng ban, công ty, ngày vào làm và nghỉ việc; vai trò và chức danh vẫn quản lý ở E-Learning."
      />

      {/* Cấu hình kết nối: nhập App ID / App Secret / máy chủ */}
      <LarkCredentialsForm view={view} />

      <LarkMapping
        configured={configured}
        companies={companies.map((c) => ({ ...c, larkName: c.larkDepartmentId ? (names[c.larkDepartmentId] ?? c.larkDepartmentId) : null }))}
      />

      <LarkSyncPanel configured={configured} mappedCount={mapped} everApplied={applied} />

      {/* Lịch sử */}
      <section className="rounded-md bg-card shadow-md" aria-labelledby="lark-history">
        <h2 id="lark-history" className="px-6 pt-6 pb-4 text-lg font-medium text-foreground">
          30 lần đồng bộ gần nhất
        </h2>
        {history.length === 0 ? (
          <EmptyState icon={History} size="sm" title="Chưa đồng bộ lần nào" description="Ghép công ty với phòng ban Lark, chạy thử rồi áp dụng để đồng bộ lần đầu." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="border-y border-border text-left text-[13px] font-medium tracking-[0.2px] text-foreground uppercase">
                  <th className="h-14 pr-4 pl-6 whitespace-nowrap">Thời gian</th>
                  <th className="h-14 px-4">Người chạy</th>
                  <th className="h-14 px-4">Kết quả</th>
                  <th className="h-14 pr-6 pl-4">Tóm tắt</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const m = (h.metadata ?? {}) as { applied?: boolean; trigger?: string };
                  return (
                    <tr key={h.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="h-[50px] pr-4 pl-6 whitespace-nowrap text-foreground">{formatDateTime(h.createdAt)}</td>
                      <td className="px-4 whitespace-nowrap text-muted-foreground">
                        {h.actor ? `${h.actor.fullName} (${h.actor.employeeCode})` : <span className="italic">Hệ thống{m.trigger === "script" ? " (script)" : ""}</span>}
                      </td>
                      <td className="px-4">
                        {m.applied ? <StatusBadge tone="success">Đã áp dụng</StatusBadge> : <StatusBadge tone="destructive">Không áp dụng</StatusBadge>}
                      </td>
                      <td className="py-2 pr-6 pl-4 text-[13px] text-muted-foreground">{describeAuditEntry("LARK_SYNC_RUN", h.metadata)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
