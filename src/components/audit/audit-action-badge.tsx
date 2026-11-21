import { StatusBadge, type StatusTone } from "@/components/status-badge";
import type { AuditGroup } from "@/lib/audit";

/** Màu theo nhóm thao tác: tạo = xanh lá, sửa = xanh dương, khoá / ẩn / tạm ngưng = cam, mật khẩu = tím. */
export const AUDIT_GROUP_TONES: Record<AuditGroup, StatusTone> = {
  create: "success",
  update: "info",
  lock: "warning",
  password: "primary",
};

export function AuditActionBadge({ label, group }: { label: string; group: AuditGroup }) {
  return <StatusBadge tone={AUDIT_GROUP_TONES[group]}>{label}</StatusBadge>;
}
