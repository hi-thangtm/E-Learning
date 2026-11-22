import { requireRole } from "@/lib/current-user";
import { addSimpleSheet, createWorkbook, workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { getSetting } from "@/lib/settings";
import { vnIsoDate } from "@/lib/format";
import type { MemberRow } from "@/lib/team-stats";
import { loadMembers, parseMemberQuery } from "../query";

/**
 * Xuất Excel báo cáo đội theo bộ lọc hiện tại: GET /team/members/export?q=&department=&overdue=1&unack=1&sort=&dir=
 * Chỉ người trong phạm vi đội (getTeamScope).
 */
export async function GET(request: Request) {
  const actor = await requireRole(["MANAGER", "COMPANY_ADMIN", "GROUP_ADMIN"]);
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const { rows } = await loadMembers(actor, parseMemberQuery(sp));

  const wb = createWorkbook(await getSetting("SYSTEM_NAME"));
  addSimpleSheet<MemberRow>(
    wb,
    "Nhân viên",
    [
      { header: "Mã NV", width: 14, value: (r) => r.employeeCode },
      { header: "Họ tên", width: 28, value: (r) => r.fullName },
      { header: "Email", width: 30, value: (r) => r.email ?? "" },
      { header: "Phòng ban", width: 26, value: (r) => r.departmentName ?? "" },
      { header: "Chức danh", width: 22, value: (r) => r.positionName ?? "" },
      { header: "Được giao", width: 12, value: (r) => r.assigned },
      { header: "Đã xong", width: 12, value: (r) => r.completed },
      { header: "Đang học", width: 12, value: (r) => r.inProgress },
      { header: "Quá hạn", width: 12, value: (r) => r.overdue },
      { header: "Chưa nắm cập nhật", width: 18, value: (r) => r.unacknowledged },
      { header: "Tỷ lệ hoàn thành (%)", width: 20, value: (r) => r.rate },
    ],
    rows,
  );
  return xlsxResponse(await workbookToBuffer(wb), `bao-cao-doi-${vnIsoDate()}.xlsx`);
}
