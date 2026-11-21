"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fieldLabel, formatAuditValue, getBeforeAfter, otherMetadataEntries } from "@/lib/audit";
import type { AuditLogDetail } from "@/lib/audit-query";
import { formatDateTimeSeconds } from "@/lib/format";
import { AuditActionBadge } from "./audit-action-badge";

/**
 * Panel chi tiết 1 dòng nhật ký (bên phải). Mở khi URL có `?log=<id>` (server đã kiểm tra phạm vi);
 * đóng = quay về `closeHref` (bỏ tham số log). Chỉ đọc.
 */
export function AuditDetailSheet({ detail, closeHref }: { detail: AuditLogDetail | null; closeHref: string }) {
  const router = useRouter();

  return (
    <Sheet
      open={!!detail}
      onOpenChange={(open) => {
        if (!open) router.replace(closeHref, { scroll: false });
      }}
    >
      {detail && (
        <SheetContent className="sm:max-w-[560px]">
          <SheetHeader>
            <SheetTitle>Chi tiết thao tác</SheetTitle>
            <SheetDescription>
              <time dateTime={new Date(detail.createdAt).toISOString()}>{formatDateTimeSeconds(detail.createdAt)}</time>
            </SheetDescription>
          </SheetHeader>
          <SheetBody className="space-y-6">
            <DetailContent detail={detail} />
          </SheetBody>
        </SheetContent>
      )}
    </Sheet>
  );
}

function DetailContent({ detail }: { detail: AuditLogDetail }) {
  const changes = getBeforeAfter(detail.action, detail.metadata);
  const others = otherMetadataEntries(detail.action, detail.metadata);
  const hasMetadata = detail.metadata !== null && detail.metadata !== undefined;

  return (
    <>
      <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-3">
        <Row label="Thao tác">
          <AuditActionBadge label={detail.label} group={detail.group} />
          {detail.summary && <p className="mt-1 text-muted-foreground">{detail.summary}</p>}
        </Row>
        <Row label="Người thực hiện">
          {detail.actor ? (
            <Link href={`/org/users/${detail.actor.id}`} className="text-foreground hover:text-primary hover:underline">
              {detail.actor.fullName} ({detail.actor.employeeCode})
            </Link>
          ) : (
            <span className="italic">Hệ thống tự động</span>
          )}
        </Row>
        <Row label="Công ty">{detail.company ? `${detail.company.name} (${detail.company.code})` : "—"}</Row>
        <Row label="Đối tượng">
          <span className="text-muted-foreground">{detail.entityTypeLabel}: </span>
          {detail.entity?.href ? (
            <Link href={detail.entity.href} className="text-foreground hover:text-primary hover:underline">
              {detail.entity.label}
            </Link>
          ) : (
            (detail.entity?.label ?? "—")
          )}
        </Row>
        <Row label="Mã thao tác">
          <code className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[13px]">{detail.action}</code>
        </Row>
      </dl>

      {changes && (
        <section>
          <h3 className="mb-3 text-[13px] tracking-[0.4px] text-foreground/45 uppercase">Thay đổi</h3>
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-[15px]">
              <thead>
                <tr className="bg-muted/60 text-left text-[13px] text-foreground">
                  <th scope="col" className="w-32 px-3 py-2 font-medium">
                    Trường
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Trước → Sau
                  </th>
                </tr>
              </thead>
              <tbody>
                {changes.map((c) => {
                  const before = formatAuditValue(c.key, c.before, detail.resolved);
                  const after = formatAuditValue(c.key, c.after, detail.resolved);
                  const same = before === after;
                  return (
                    <tr key={c.key} className="border-t border-border align-top">
                      <td className="px-3 py-2 text-foreground">{c.label}</td>
                      <td className="px-3 py-2">
                        {same ? (
                          <span className="text-muted-foreground">{after} (không đổi)</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="rounded-sm bg-destructive/10 px-1.5 text-destructive line-through decoration-destructive/50">
                              {before}
                            </span>
                            <ArrowRight className="size-4 shrink-0 text-foreground/45" aria-label="thành" />
                            <span className="rounded-sm bg-success/16 px-1.5 text-success">{after}</span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {others.length > 0 && (
        <section>
          <h3 className="mb-3 text-[13px] tracking-[0.4px] text-foreground/45 uppercase">Chi tiết</h3>
          <dl className="grid grid-cols-[180px_1fr] gap-x-4 gap-y-2">
            {others.map(([key, value]) => (
              <Row key={key} label={fieldLabel(key)}>
                <span className="break-words">{formatAuditValue(key, value, detail.resolved)}</span>
              </Row>
            ))}
          </dl>
        </section>
      )}

      {!changes && others.length === 0 && (
        <p className="text-muted-foreground">Thao tác này không có dữ liệu chi tiết.</p>
      )}

      {hasMetadata && (
        <details className="rounded-md border border-border">
          <summary className="cursor-pointer px-3 py-2 text-[13px] text-muted-foreground select-none hover:text-foreground">
            Dữ liệu gốc (JSON)
          </summary>
          <pre className="max-h-80 overflow-auto border-t border-border bg-muted/40 p-3 font-mono text-[12px] leading-relaxed text-foreground">
            {JSON.stringify(detail.metadata, null, 2)}
          </pre>
        </details>
      )}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-foreground">{label}</dt>
      <dd className="min-w-0 text-muted-foreground">{children}</dd>
    </>
  );
}
