import { requireRole } from "@/lib/current-user";
import { addSimpleSheet, createWorkbook, workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { vnIsoDate } from "@/lib/format";
import { LarkApiError, LarkNotConfiguredError } from "@/lib/lark/client";
import { planLarkSync, type FieldChange, type LarkPlan } from "@/lib/lark/sync";
import { getSetting } from "@/lib/settings";

const FIELD: Record<FieldChange["field"], string> = {
  fullName: "Họ tên", email: "Email", phone: "Điện thoại", hireDate: "Ngày vào làm", company: "Công ty", department: "Phòng ban", larkUserId: "Liên kết Lark", status: "Trạng thái",
};
const KIND = { create: "Tạo mới", update: "Cập nhật", transfer: "Chuyển công ty", lock: "Khoá", reopen: "Mở lại" } as const;
const DEPT_KIND = { create: "Tạo mới", adopt: "Ghép phòng có sẵn", update: "Cập nhật", deactivate: "Ngừng hoạt động" } as const;

/** Tải Excel chi tiết kế hoạch đồng bộ Lark (tính lại tại thời điểm tải) — chỉ Admin tập đoàn. */
export async function GET() {
  await requireRole(["GROUP_ADMIN"]);
  let plan: LarkPlan;
  try {
    plan = await planLarkSync();
  } catch (e) {
    const message = e instanceof LarkNotConfiguredError || e instanceof LarkApiError ? e.message : "Không đọc được Lark.";
    return new Response(message, { status: 502, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const wb = createWorkbook(await getSetting("SYSTEM_NAME"));
  type U = LarkPlan["users"][number];
  addSimpleSheet<U>(wb, "Nhân viên", [
    { header: "Loại", width: 16, value: (u) => KIND[u.kind] },
    { header: "Mã NV", width: 14, value: (u) => u.employeeCode },
    { header: "Họ tên", width: 28, value: (u) => u.fullName },
    { header: "Email", width: 28, value: (u) => u.email ?? "" },
    { header: "Điện thoại", width: 14, value: (u) => u.phone ?? "" },
    { header: "Công ty", width: 16, value: (u) => (u.fromCompanyCode ? `${u.fromCompanyCode} → ${u.companyCode}` : u.companyCode) },
    { header: "Phòng ban", width: 26, value: (u) => (u.keepDepartment ? "(giữ nguyên)" : (u.departmentName ?? "")) },
    { header: "Thay đổi", width: 60, value: (u) => [u.reason, ...u.changes.map((c) => `${FIELD[c.field]}: ${c.from ?? "—"} → ${c.to ?? "—"}`)].filter(Boolean).join("; ") },
  ], plan.users);
  addSimpleSheet<LarkPlan["departments"][number]>(wb, "Phòng ban", [
    { header: "Loại", width: 18, value: (d) => DEPT_KIND[d.kind] },
    { header: "Công ty", width: 12, value: (d) => d.companyCode },
    { header: "Mã", width: 14, value: (d) => d.code },
    { header: "Tên", width: 30, value: (d) => d.name },
    { header: "Thay đổi", width: 50, value: (d) => d.changes.join("; ") },
  ], plan.departments);
  addSimpleSheet<LarkPlan["managers"][number]>(wb, "Trưởng phòng", [
    { header: "Công ty", width: 12, value: (m) => m.companyCode },
    { header: "Phòng ban", width: 30, value: (m) => m.departmentName },
    { header: "Trưởng phòng", width: 36, value: (m) => (m.employeeCode ? `${m.fullName} (${m.employeeCode})` : "Gỡ trưởng phòng") },
    { header: "Nâng vai trò", width: 14, value: (m) => (m.promote ? "Có" : "") },
  ], plan.managers);
  addSimpleSheet<LarkPlan["skipped"][number]>(wb, "Bỏ qua", [
    { header: "Mã NV", width: 14, value: (s) => s.employeeCode ?? "" },
    { header: "Họ tên", width: 28, value: (s) => s.fullName },
    { header: "Lý do", width: 60, value: (s) => s.reason },
  ], plan.skipped);
  addSimpleSheet<LarkPlan["localOnly"][number]>(wb, "Chỉ có ở E-Learning", [
    { header: "Mã NV", width: 14, value: (u) => u.employeeCode },
    { header: "Họ tên", width: 28, value: (u) => u.fullName },
    { header: "Công ty", width: 12, value: (u) => u.companyCode },
    { header: "Trạng thái", width: 12, value: (u) => (u.status === "ACTIVE" ? "Đang làm" : "Đã khoá") },
  ], plan.localOnly);
  addSimpleSheet<string>(wb, "Cảnh báo", [{ header: "Cảnh báo", width: 100, value: (w) => w }], plan.warnings);

  return xlsxResponse(await workbookToBuffer(wb), `dong-bo-lark-${vnIsoDate()}.xlsx`);
}
