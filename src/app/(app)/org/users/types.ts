import type { Role } from "@prisma/client";
import type { ActionState } from "@/lib/action-state";

/** Dữ liệu 1 người dùng đưa vào dialog sửa (page.tsx -> client). */
export type UserFormValue = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  companyId: string;
  departmentId: string;
  positionId: string;
  /** yyyy-MM-dd hoặc "" */
  hireDate: string;
  role: Role;
  /** Phòng ban người này đang làm trưởng — để cảnh báo khi chuyển công ty */
  managedDepartments: { code: string; name: string }[];
};

export type CompanyOption = { id: string; code: string; name: string; isGroup: boolean; isActive: boolean };
export type DepartmentOption = {
  id: string;
  companyId: string;
  parentId: string | null;
  code: string;
  name: string;
  isActive: boolean;
};
export type PositionOption = { id: string; code: string; name: string; isActive: boolean };

/** Danh sách lựa chọn cho form thêm / sửa — tính 1 lần ở page.tsx theo người đang thao tác. */
export type UserFormOptions = {
  /** Admin tập đoàn: được chọn công ty, chuyển công ty, gán Admin tập đoàn */
  isGroupAdmin: boolean;
  /** Id người đang đăng nhập (sửa chính mình -> khoá vai trò, công ty) */
  actorId: string;
  /** Công ty mặc định khi thêm mới (Admin công ty: công ty mình; Admin tập đoàn: công ty đang lọc hoặc công ty tổng) */
  defaultCompanyId: string;
  groupCompanyId: string;
  companies: CompanyOption[];
  departments: DepartmentOption[];
  positions: PositionOption[];
  assignableRoles: Role[];
};

/** Kết quả tạo người dùng: kèm mật khẩu ban đầu để hiện 1 lần. */
export type CreateUserState = ActionState & {
  created?: { employeeCode: string; fullName: string; password: string };
};

/** Kết quả đặt lại mật khẩu: kèm mật khẩu mới để hiện 1 lần. */
export type ResetPasswordState = ActionState & { password?: string };

/** Trạng thái 1 dòng để quyết định menu thao tác hiện gì. */
export type UserRowState = {
  status: "ACTIVE" | "INACTIVE";
  /** ISO — đang bị khoá tạm do sai mật khẩu đến lúc này (null = không) */
  tempLockedUntil: string | null;
  /** false khi Admin công ty xem một Admin tập đoàn: chỉ được xem chi tiết */
  canEdit: boolean;
  isSelf: boolean;
};
