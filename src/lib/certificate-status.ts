import type { StatusTone } from "@/components/status-badge";

/** Trạng thái chứng nhận — dùng được cả server lẫn trình duyệt. "Sắp hết hạn" = còn ≤ 30 ngày. */
export type CertificateStatusKey = "valid" | "expiring" | "expired" | "revoked";

export const CERTIFICATE_STATUS: Record<CertificateStatusKey, { label: string; tone: StatusTone }> = {
  valid: { label: "Còn hiệu lực", tone: "success" },
  expiring: { label: "Sắp hết hạn", tone: "warning" },
  expired: { label: "Hết hạn", tone: "secondary" },
  revoked: { label: "Đã thu hồi", tone: "destructive" },
};

const EXPIRING_DAYS = 30;

export function certificateStatus(
  cert: { expiresAt: Date | string | null; revokedAt: Date | string | null },
  now: Date = new Date(),
): CertificateStatusKey {
  if (cert.revokedAt) return "revoked";
  if (!cert.expiresAt) return "valid";
  const expires = new Date(cert.expiresAt).getTime();
  if (expires <= now.getTime()) return "expired";
  return expires - now.getTime() <= EXPIRING_DAYS * 86_400_000 ? "expiring" : "valid";
}
