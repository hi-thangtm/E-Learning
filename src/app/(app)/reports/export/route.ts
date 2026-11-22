import { logAudit } from "@/lib/audit";
import { requireRole } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { addSimpleSheet, createWorkbook, workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { getSetting } from "@/lib/settings";
import { formatDate, formatDateTime } from "@/lib/format";
import { METRICS, REPORT_NOTES } from "@/lib/report-definitions";
import {
  parseReportFilters,
  REPORT_TAB_FILE,
  REPORT_TAB_LABELS,
  REPORT_TABS,
  resolveReportContext,
  type ReportContext,
  type ReportTab,
} from "@/lib/reports";
import { getParam } from "@/lib/table-params";
import { addTabSheet, loadTab, parseTabState, type TabState } from "../data";

/**
 * Xuất Excel báo cáo theo bộ lọc hiện tại: GET /reports/export?tab=<courses|departments|members|versions|certificates|all>&...
 * - 1 tab (kể cả màn chi tiết khoá) → 1 sheet. `all` → sheet “Thông tin” + 5 sheet + “Định nghĩa chỉ số”.
 * - Phạm vi luôn qua getTeamScope (resolveReportContext). Ghi audit REPORT_EXPORTED.
 */
export async function GET(request: Request) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const all = getParam(sp, "tab") === "all";
  const state = parseTabState(sp);
  const now = new Date();
  const ctx = await resolveReportContext(actor, parseReportFilters(sp), prisma, now);
  if (ctx.scope.empty) {
    return new Response("Bạn chưa được chỉ định làm trưởng phòng nào nên không có dữ liệu báo cáo.", {
      status: 403,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const wb = createWorkbook(await getSetting("SYSTEM_NAME"));
  const filterText = describeFilters(ctx);
  let rows = 0;
  let tabLabel: string;

  if (all) {
    tabLabel = "Toàn bộ báo cáo";
    addInfoSheet(wb, actor.fullName, now, filterText, tabLabel);
    for (const tab of REPORT_TABS) {
      const tabState: TabState = { ...state, tab, q: "", sort: null, dir: "desc", course: null };
      rows += addTabSheet(wb, await loadTab(ctx, tabState));
    }
    addDefinitionSheet(wb);
  } else {
    const data = await loadTab(ctx, state);
    tabLabel =
      data.kind === "courseLearners"
        ? `${REPORT_TAB_LABELS.courses} — ${data.course.code}`
        : data.kind === "versionLearners"
          ? `${REPORT_TAB_LABELS.versions} — ${data.course.code}`
          : REPORT_TAB_LABELS[state.tab as ReportTab];
    rows = addTabSheet(wb, data);
  }

  await logAudit(prisma, {
    actorId: actor.id,
    companyId: actor.companyId,
    action: "REPORT_EXPORTED",
    entityType: "Report",
    entityId: null,
    metadata: { tab: all ? "all" : state.tab, tabLabel, filters: filterText.map(([k, v]) => `${k}: ${v}`).join("; "), rows },
  });

  const fileTab = all ? REPORT_TAB_FILE.all : REPORT_TAB_FILE[state.tab];
  return xlsxResponse(await workbookToBuffer(wb), `BaoCao_${fileTab}_${fileStamp(now)}.xlsx`);
}

/** yyyyMMdd-HHmm theo giờ Việt Nam. */
function fileStamp(d: Date): string {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Ho_Chi_Minh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}`;
}

function describeFilters(ctx: ReportContext): [string, string][] {
  const f = ctx.filters;
  const scope =
    ctx.actor.role === "MANAGER" ? "Các phòng tôi làm trưởng (gồm phòng con)" : ctx.actor.role === "COMPANY_ADMIN" ? "Cả công ty" : "Toàn tập đoàn";
  return [
    ["Phạm vi", scope],
    ["Công ty", ctx.labels.company ?? (ctx.actor.role === "GROUP_ADMIN" ? "Toàn tập đoàn" : "—")],
    ["Phòng ban", ctx.labels.department ? `${ctx.labels.department}${f.includeSub ? " (gồm phòng con)" : " (không gồm phòng con)"}` : "Mọi phòng ban"],
    ["Danh mục", ctx.labels.category ?? "Mọi danh mục"],
    ["Ngày giao từ", f.from ? formatDate(`${f.from}T12:00:00+07:00`) : "—"],
    ["Ngày giao đến", f.to ? formatDate(`${f.to}T12:00:00+07:00`) : "—"],
    ["Nguồn", f.includeSelf ? "Gồm khoá tự đăng ký" : "Chỉ khoá được giao (bỏ tự đăng ký)"],
    ["Số nhân viên trong phạm vi", String(ctx.users.length)],
  ];
}

function addInfoSheet(wb: ReturnType<typeof createWorkbook>, actorName: string, now: Date, filters: [string, string][], tabLabel: string) {
  addSimpleSheet<[string, string]>(
    wb,
    "Thông tin",
    [
      { header: "Mục", width: 30, value: (r) => r[0] },
      { header: "Giá trị", width: 60, value: (r) => r[1] },
    ],
    [["Báo cáo", tabLabel], ["Người xuất", actorName], ["Thời điểm xuất", formatDateTime(now)], ...filters],
  );
}

function addDefinitionSheet(wb: ReturnType<typeof createWorkbook>) {
  const rows: [string, string][] = [...REPORT_NOTES.map((n) => [n.label, n.definition] as [string, string]), ...Object.values(METRICS).map((m) => [m.label, m.definition] as [string, string])];
  addSimpleSheet<[string, string]>(
    wb,
    "Định nghĩa chỉ số",
    [
      { header: "Chỉ số", width: 28, value: (r) => r[0] },
      { header: "Định nghĩa", width: 110, value: (r) => r[1] },
    ],
    rows,
  );
}
