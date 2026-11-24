import "server-only";
import { getLarkClient, larkPaginate } from "./client";

/**
 * Đọc danh bạ Lark (Việc L1) — contact v3, tenant_access_token, phạm vi danh bạ “Toàn bộ thành viên”.
 *
 * Quyền (scope) cần cấp trên Lark Developer — xem docs/lark-setup.md:
 *   contact:contact.base:readonly, contact:department.base:readonly, contact:department.organize:readonly,
 *   contact:user.base:readonly, contact:user.employee_id:readonly, contact:user.employee:readonly,
 *   contact:user.employee_number:read, contact:user.department:readonly, contact:user.email:readonly, contact:user.phone:readonly
 */

export type LarkDepartment = {
  /** open_department_id */
  openId: string;
  name: string;
  /** open_department_id của phòng cha; "0" = con trực tiếp của gốc */
  parentOpenId: string;
  /** user_id của trưởng phòng (null = không có) */
  leaderUserId: string | null;
};

export type LarkUser = {
  /** user_id (cần quyền contact:user.employee_id:readonly) */
  userId: string;
  employeeNo: string | null;
  name: string;
  /** Email doanh nghiệp ưu tiên, không có thì email cá nhân */
  email: string | null;
  mobile: string | null;
  /** open_department_id các phòng người này thuộc (gốc = "0") */
  departmentIds: string[];
  /** Phòng chính (orders[].is_primary_dept) */
  primaryDepartmentId: string | null;
  /** Unix giây */
  joinTime: number | null;
  /** Nghỉ việc / đóng băng / đã rời */
  inactive: boolean;
};

export type LarkDirectory = { departments: LarkDepartment[]; users: LarkUser[] };

const ROOT = "0";

/** Toàn bộ cây phòng ban (bỏ phòng đã xoá): duyệt theo tầng từ gốc "0", mỗi phòng 1 lần gọi children (không dùng fetch_child — phòng lớn bị lỗi 43010). */
export async function fetchLarkDepartments(): Promise<LarkDepartment[]> {
  const client = await getLarkClient();
  const out: LarkDepartment[] = [];
  const seen = new Set<string>();
  let level = [ROOT];
  while (level.length > 0) {
    const next: string[] = [];
    for (const parent of level) {
      const items = await larkPaginate("đọc phòng ban con", (page_token) =>
        client.contact.department.children({
          path: { department_id: parent },
          params: { department_id_type: "open_department_id", user_id_type: "user_id", page_size: 50, page_token },
        }),
      );
      for (const d of items) {
        const openId = d.open_department_id;
        if (!openId || seen.has(openId) || d.status?.is_deleted) continue;
        seen.add(openId);
        out.push({ openId, name: d.name?.trim() || openId, parentOpenId: d.parent_department_id || parent, leaderUserId: d.leader_user_id || null });
        next.push(openId);
      }
    }
    level = next;
  }
  return out;
}

/** Nhân viên của gốc + mọi phòng (find_by_department chỉ trả người TRỰC TIẾP trong phòng), gộp theo user_id. */
export async function fetchLarkUsers(departmentIds: string[]): Promise<LarkUser[]> {
  const client = await getLarkClient();
  const byId = new Map<string, LarkUser>();
  for (const dept of [ROOT, ...departmentIds]) {
    const items = await larkPaginate("đọc nhân viên theo phòng", (page_token) =>
      client.contact.user.findByDepartment({
        params: { department_id: dept, department_id_type: "open_department_id", user_id_type: "user_id", page_size: 50, page_token },
      }),
    );
    for (const u of items) {
      if (!u.user_id) continue;
      const existing = byId.get(u.user_id);
      const deptIds = [...new Set([...(existing?.departmentIds ?? []), ...(u.department_ids ?? []), dept])];
      const primary = u.orders?.find((o) => o.is_primary_dept)?.department_id ?? existing?.primaryDepartmentId ?? null;
      byId.set(u.user_id, {
        userId: u.user_id,
        employeeNo: u.employee_no?.trim() || null,
        name: (u.name ?? "").trim(),
        email: u.enterprise_email?.trim() || u.email?.trim() || null,
        mobile: u.mobile?.trim() || null,
        departmentIds: deptIds,
        primaryDepartmentId: primary,
        joinTime: typeof u.join_time === "number" && u.join_time > 0 ? u.join_time : null,
        inactive: !!(u.status?.is_resigned || u.status?.is_frozen || u.status?.is_exited),
      });
    }
  }
  return [...byId.values()];
}

/** Toàn bộ danh bạ (phòng ban + nhân viên). */
export async function fetchLarkDirectory(): Promise<LarkDirectory> {
  const departments = await fetchLarkDepartments();
  const users = await fetchLarkUsers(departments.map((d) => d.openId));
  return { departments, users };
}
