import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile as fsReadFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Lưu file dùng chung (ảnh bìa, PDF tài liệu...) — chỉ chạy ở server.
 *
 * - Hiện lưu trên ổ đĩa, thư mục gốc = UPLOAD_DIR (mặc định ./uploads; Docker: /app/uploads, có volume).
 * - Muốn đổi sang S3 / Bunny Storage: viết class mới cài `FileStorage` trong file này rồi đổi dòng
 *   `const storage: FileStorage = ...` — phần còn lại của app chỉ dùng saveFile / readFile / deleteFile / fileUrl.
 * - Key dạng `<thư mục>/<id ngẫu nhiên>.<đuôi>` (VD courses/thumbnails/3f9c…e1.webp). KHÔNG dùng tên file gốc.
 * - Loại file kiểm tra theo NỘI DUNG (magic bytes), không tin đuôi file hay Content-Type trình duyệt gửi lên.
 * - Xem file qua route /api/files/<key> (bắt buộc đăng nhập).
 */

// ---------------------------------------------------------------------------------------------
// Nơi lưu

export interface FileStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** null nếu không có */
  get(key: string): Promise<Buffer | null>;
  /** Không có cũng không báo lỗi */
  remove(key: string): Promise<void>;
}

class LocalDiskStorage implements FileStorage {
  constructor(private readonly root: string) {}

  /** Đường dẫn tuyệt đối, bảo đảm nằm TRONG thư mục gốc (chặn ../). */
  private resolve(key: string): string {
    assertValidKey(key);
    const full = path.resolve(/*turbopackIgnore: true*/ this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Đường dẫn file không hợp lệ.");
    return full;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const full = this.resolve(key);
    await mkdir(path.dirname(/*turbopackIgnore: true*/ full), { recursive: true });
    // flag "wx": không bao giờ ghi đè file đã có
    await writeFile(full, data, { flag: "wx" });
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await fsReadFile(this.resolve(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }
}

// turbopackIgnore: thư mục upload chỉ dùng lúc chạy -> không để Turbopack đóng gói cả dự án vào bản standalone
export const UPLOAD_ROOT = path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.UPLOAD_DIR || "./uploads");

const storage: FileStorage = new LocalDiskStorage(UPLOAD_ROOT);

// ---------------------------------------------------------------------------------------------
// Loại file cho phép

export type FileKind = "image" | "pdf" | "logo";

type DetectedType = { ext: "jpg" | "png" | "webp" | "pdf"; contentType: string };

export const FILE_RULES: Record<FileKind, { maxBytes: number; allowed: DetectedType["ext"][]; label: string }> = {
  image: { maxBytes: 2 * 1024 * 1024, allowed: ["jpg", "png", "webp"], label: "ảnh JPG, PNG hoặc WEBP" },
  pdf: { maxBytes: 20 * 1024 * 1024, allowed: ["pdf"], label: "tài liệu PDF" },
  // Logo hệ thống (Việc 28A): KHÔNG nhận SVG (có thể chứa mã chạy) — chỉ ảnh raster kiểm tra bằng magic bytes
  logo: { maxBytes: 500 * 1024, allowed: ["png", "webp"], label: "ảnh PNG hoặc WEBP" },
};

const CONTENT_TYPES: Record<DetectedType["ext"], string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  pdf: "application/pdf",
};

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((b, i) => bytes[offset + i] === b);
}

/** Nhận loại file bằng magic bytes ở đầu file. */
export function detectFileType(bytes: Uint8Array): DetectedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { ext: "jpg", contentType: CONTENT_TYPES.jpg };
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { ext: "png", contentType: CONTENT_TYPES.png };
  // RIFF....WEBP
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { ext: "webp", contentType: CONTENT_TYPES.webp };
  }
  // %PDF-
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { ext: "pdf", contentType: CONTENT_TYPES.pdf };
  return null;
}

// ---------------------------------------------------------------------------------------------
// Kiểm tra key / thư mục

const FOLDER_REGEX = /^[a-z0-9-]+(\/[a-z0-9-]+)*$/;
const KEY_REGEX = /^[a-z0-9-]+(\/[a-z0-9-]+)*\/[a-z0-9]{8,64}\.(jpg|png|webp|pdf)$/;

export function isValidKey(key: string): boolean {
  return key.length <= 300 && KEY_REGEX.test(key);
}

function assertValidKey(key: string): void {
  if (!isValidKey(key)) throw new Error("Đường dẫn file không hợp lệ.");
}

/** Dung lượng dạng “2,1MB” — làm tròn LÊN để file vượt giới hạn không hiện thành đúng bằng giới hạn. */
function formatMb(bytes: number): string {
  const mb = Math.ceil((bytes / 1024 / 1024) * 10) / 10;
  return `${mb.toLocaleString("vi-VN", { maximumFractionDigits: 1 })}MB`;
}

// ---------------------------------------------------------------------------------------------
// API dùng trong app

export type SavedFile = { key: string; contentType: string; size: number };

/**
 * Kiểm tra + lưu file người dùng tải lên. Trả `{ error }` (tiếng Việt) nếu không hợp lệ.
 * `folder` do code quy định (VD "courses/thumbnails"), không lấy từ dữ liệu người dùng.
 */
export async function saveFile(file: File, folder: string, kind: FileKind): Promise<SavedFile | { error: string }> {
  if (!FOLDER_REGEX.test(folder)) throw new Error(`Thư mục lưu file không hợp lệ: ${folder}`);
  const rule = FILE_RULES[kind];

  if (file.size === 0) return { error: "File rỗng." };
  if (file.size > rule.maxBytes) {
    return { error: `File quá lớn (${formatMb(file.size)}). Tối đa ${formatMb(rule.maxBytes)}.` };
  }

  const data = Buffer.from(await file.arrayBuffer());
  const detected = detectFileType(data.subarray(0, 16));
  if (!detected || !rule.allowed.includes(detected.ext)) {
    return { error: `File không phải ${rule.label} (hệ thống kiểm tra theo nội dung file, không theo đuôi).` };
  }

  const key = `${folder}/${randomUUID().replace(/-/g, "")}.${detected.ext}`;
  await storage.put(key, data, detected.contentType);
  return { key, contentType: detected.contentType, size: data.length };
}

export async function readFile(key: string): Promise<{ data: Buffer; contentType: string } | null> {
  if (!isValidKey(key)) return null;
  const data = await storage.get(key);
  if (!data) return null;
  const ext = key.slice(key.lastIndexOf(".") + 1) as DetectedType["ext"];
  return { data, contentType: CONTENT_TYPES[ext] };
}

/** Xoá file (bỏ qua key rỗng / sai / không còn). Không ném lỗi để không làm hỏng thao tác chính. */
export async function deleteFile(key: string | null | undefined): Promise<void> {
  if (!key || !isValidKey(key)) return;
  try {
    await storage.remove(key);
  } catch (error) {
    console.error(`[storage] Không xoá được ${key}:`, error);
  }
}

/** URL hiển thị file — định nghĩa ở file-url.ts để dùng được cả ở trình duyệt. */
export { fileUrl } from "./file-url";
