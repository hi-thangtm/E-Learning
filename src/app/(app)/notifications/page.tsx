import type { Metadata } from "next";
import Link from "next/link";
import { DataTableEmpty } from "@/components/data-table/data-table-empty";
import { DataTableFilter } from "@/components/data-table/data-table-filter";
import { DataTablePagination } from "@/components/data-table/data-table-pagination";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/current-user";
import { formatNumber } from "@/lib/format";
import { NOTIFICATION_TYPE_KEYS, NOTIFICATION_TYPES } from "@/lib/notification-types";
import { listNotifications, NOTIFICATIONS_PAGE_SIZE, type NotificationTab } from "@/lib/notifications";
import { buildHref, getEnumParam, parseTableParams, type SearchParams } from "@/lib/table-params";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, NotificationList } from "./notification-list";

export const metadata: Metadata = { title: "Thông báo" };

const PATHNAME = "/notifications";
const TABS = ["all", "unread"] as const;

/** Thông báo của chính người đang đăng nhập (mọi vai trò). */
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const tab: NotificationTab = getEnumParam(sp, "tab", TABS) ?? "all";
  const type = getEnumParam(sp, "type", NOTIFICATION_TYPE_KEYS);
  const { page } = parseTableParams(sp);

  const { rows, total, all, unread } = await listNotifications(user.id, { tab, type, page });

  const tabs: { value: NotificationTab; label: string; count: number }[] = [
    { value: "all", label: "Tất cả", count: all },
    { value: "unread", label: "Chưa đọc", count: unread },
  ];

  return (
    <>
      <PageHeader
        title="Thông báo"
        description="Khoá học được giao, hạn hoàn thành, phiên bản quy trình mới, chứng nhận…"
        actions={<MarkAllReadButton disabled={unread === 0} />}
      />

      <div className="overflow-hidden rounded-md bg-card shadow-md">
        <div className="flex items-center justify-between gap-4 p-6">
          <nav aria-label="Lọc theo trạng thái đọc" className="inline-flex h-[38px] rounded-lg bg-muted p-1">
            {tabs.map((t) => (
              <Link
                key={t.value}
                href={buildHref(PATHNAME, sp, { tab: t.value === "all" ? null : t.value, page: null })}
                aria-current={tab === t.value ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3.5 text-[15px] font-medium whitespace-nowrap transition-colors",
                  tab === t.value ? "bg-card text-primary shadow-xs" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
                <span className={cn("inline-flex shrink-0 items-center rounded-full px-1.5 text-[12px] whitespace-nowrap tabular-nums", tab === t.value ? "bg-primary/16" : "bg-card")}>
                  {formatNumber(t.count)}
                </span>
              </Link>
            ))}
          </nav>
          <div className="w-64">
            <DataTableFilter
              param="type"
              label="Loại"
              allLabel="Tất cả loại"
              options={NOTIFICATION_TYPE_KEYS.map((k) => ({ value: k, label: NOTIFICATION_TYPES[k].label }))}
            />
          </div>
        </div>

        <div className="border-t border-border">
          {rows.length === 0 ? (
            <DataTableEmpty
              title={tab === "unread" ? "Không có thông báo chưa đọc" : "Bạn chưa có thông báo nào"}
              description="Thông báo mới (được giao khoá, sắp đến hạn…) sẽ hiện ở đây và trên chuông góc trên."
              filtered={!!type || page > 1}
              clearHref={PATHNAME}
            />
          ) : (
            <NotificationList items={rows} />
          )}
        </div>

        <DataTablePagination
          pathname={PATHNAME}
          searchParams={sp}
          page={page}
          pageSize={NOTIFICATIONS_PAGE_SIZE}
          total={total}
        />
      </div>
    </>
  );
}
