/**
 * Mô tả nhóm áp dụng của quy tắc giao tự động bằng chữ — dùng chung server / trình duyệt.
 * VD: “Công ty A › Phòng Kinh doanh (gồm phòng con) · Chức danh: Nhân viên kinh doanh”, công ty trống = “Toàn tập đoàn”.
 */
export function describeRuleTarget(t: {
  companyName: string | null;
  departmentName: string | null;
  includeSubDepartments: boolean;
  positionName: string | null;
}): string {
  let text = t.companyName ?? "Toàn tập đoàn";
  if (t.departmentName) text += ` › ${t.departmentName}${t.includeSubDepartments ? " (gồm phòng con)" : ""}`;
  if (t.positionName) text += ` · Chức danh: ${t.positionName}`;
  return text;
}
