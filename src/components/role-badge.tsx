import type { Role } from "@prisma/client";
import { StatusBadge, type StatusTone } from "@/components/status-badge";
import { ROLE_LABELS } from "@/lib/roles";

/** Màu badge theo vai trò — dùng thống nhất ở mọi bảng có cột vai trò. */
export const ROLE_TONES: Record<Role, StatusTone> = {
  GROUP_ADMIN: "primary",
  COMPANY_ADMIN: "info",
  CONTENT_EDITOR: "warning",
  MANAGER: "success",
  LEARNER: "secondary",
};

export function RoleBadge({ role }: { role: Role }) {
  return <StatusBadge tone={ROLE_TONES[role]}>{ROLE_LABELS[role]}</StatusBadge>;
}
