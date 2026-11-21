import { randomInt } from "node:crypto";

// Bỏ các ký tự dễ nhầm khi đọc / gõ lại: 0 O o, 1 l I i
const LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";
const ALPHABET = LETTERS + DIGITS;

function pick(chars: string): string {
  return chars[randomInt(chars.length)];
}

/**
 * Mật khẩu tạm ngẫu nhiên (mặc định 10 ký tự, chữ + số), luôn có ít nhất 1 chữ và 1 số.
 * Dùng nguồn ngẫu nhiên an toàn của Node (crypto.randomInt).
 */
export function generateTempPassword(length = 10): string {
  const chars = [pick(LETTERS), pick(DIGITS)];
  while (chars.length < length) chars.push(pick(ALPHABET));
  // Trộn Fisher–Yates để chữ / số bắt buộc không luôn nằm đầu
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}
