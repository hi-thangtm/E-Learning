import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Mã hoá bí mật lưu trong database (VD App Secret Lark nhập trên giao diện) — AES-256-GCM.
 * Khoá = SHA-256(AUTH_SECRET + mục đích). Đổi AUTH_SECRET → bí mật cũ không giải mã được nữa (phải nhập lại trên giao diện).
 * Định dạng lưu: "v1:<iv base64>:<tag base64>:<dữ liệu base64>".
 */
function keyFor(purpose: string): Buffer {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) throw new Error("Thiếu AUTH_SECRET — không mã hoá / giải mã được bí mật lưu trong database.");
  return createHash("sha256").update(`${secret}:${purpose}`).digest();
}

export function sealSecret(plain: string, purpose: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(purpose), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Giải mã; sai khoá / dữ liệu hỏng → null (không ném lỗi chứa dữ liệu nhạy cảm). */
export function openSecret(sealed: string, purpose: string): string | null {
  try {
    const [v, iv, tag, data] = sealed.split(":");
    if (v !== "v1" || !iv || !tag || !data) return null;
    const decipher = createDecipheriv("aes-256-gcm", keyFor(purpose), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
