/**
 * DỮ LIỆU DEMO đầy đủ chức năng + giao diện:   npm run demo:seed -- --yes
 *
 * - XOÁ SẠCH database trong .env (DATABASE_URL) rồi nạp lại. Bắt buộc cờ --yes. Từ chối chạy với elearning_test / elearning_perf.
 * - Mọi tài khoản: mật khẩu 123456789, không bắt đổi mật khẩu. Danh sách tài khoản: docs/demo-data.md (và in ra cuối script).
 * - Tập đoàn giả định “Hưng Thịnh”: 10 công ty, 10+ chức danh / danh mục / phòng ban, ~80 người dùng, 19 khoá học (đủ trạng thái,
 *   nhiều phiên bản MINOR / MAJOR, đề xuất chờ duyệt / bị từ chối), 10 lộ trình, 13 quy tắc giao, lượt học đủ trạng thái
 *   (chưa bắt đầu, đang học, quá hạn, hoàn thành, học lại sau bản MAJOR, chờ xác nhận bản MINOR, chứng nhận sắp hết / hết hạn, huỷ),
 *   bài làm, chứng nhận, đánh giá, thông báo, nhật ký thao tác, lịch sử tác vụ hằng ngày.
 * - Mô phỏng theo cùng quy tắc với scripts/seed-perf.ts (docs/database.md). Ngẫu nhiên có hạt giống cố định → chạy lại ra cùng bộ dữ liệu
 *   (thời điểm tính theo lúc chạy).
 * - Video: YouTube công khai cho phép nhúng (cần Internet để xem). Không dùng Bunny.
 */
import bcrypt from "bcryptjs";
import type { EnrollmentSource, EnrollmentStatus, LessonType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { vnDayEnd, vnIsoDate } from "@/lib/format";
import { SETTING_META } from "@/lib/settings-meta";
import { DAY, Rng, databaseNameOf, idFactory } from "./perf/common";

const PASSWORD = "123456789";
const NOW = Date.now();
const HOUR = 3_600_000;
const rng = new Rng(20261123);
const newId = idFactory(rng, "d");

// ---------------------------------------------------------------------------------------------
// An toàn: chỉ chạy khi có --yes và KHÔNG phải database kiểm thử / đo hiệu năng

const dbName = databaseNameOf(process.env.DATABASE_URL);
if (!dbName) {
  console.error("✘ Không đọc được DATABASE_URL (chạy bằng: npm run demo:seed -- --yes).");
  process.exit(1);
}
if (["elearning_test", "elearning_perf"].includes(dbName)) {
  console.error(`✘ Từ chối chạy trên database "${dbName}" (dành cho kiểm thử / đo hiệu năng).`);
  process.exit(1);
}
if (!process.argv.includes("--yes")) {
  console.error(`✘ Lệnh này XOÁ SẠCH dữ liệu của database "${dbName}" rồi nạp dữ liệu demo.\n  Chạy lại kèm --yes để xác nhận:  npm run demo:seed -- --yes`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Tiện ích

const at = (t: number) => new Date(Math.round(t));
const ago = (days: number) => NOW - days * DAY;
const clampNow = (t: number) => Math.min(t, NOW - 5 * 60_000);
const between = (a: number, b: number) => (b <= a ? a : a + rng.next() * (b - a));
const dueOf = (t: number, days: number) => vnDayEnd(vnIsoDate(at(t + days * DAY))).getTime();
const addMonths = (t: number, m: number) => {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.getTime();
};
const dateOnly = (t: number) => new Date(`${vnIsoDate(at(t))}T00:00:00Z`);

const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"];
const DEM = ["Văn", "Thị", "Minh", "Thu", "Quốc", "Ngọc", "Hữu", "Thanh", "Đức", "Bảo", "Gia", "Hoài", "Kim", "Xuân"];
const TEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hải", "Hiếu", "Hoa", "Hùng", "Hương", "Khánh", "Lan", "Linh", "Long", "Mai", "Nam", "Ngân", "Phong", "Phúc", "Quân", "Quỳnh", "Sơn", "Tâm", "Thảo", "Thắng", "Trang", "Trung", "Tú", "Tuấn", "Uyên", "Vy", "Yến"];
const usedNames = new Set<string>();
function fullName(): string {
  for (;;) {
    const n = `${rng.pick(HO)} ${rng.pick(DEM)} ${rng.pick(TEN)}`;
    if (!usedNames.has(n)) return usedNames.add(n), n;
  }
}

/** Video YouTube công khai, cho phép nhúng. duration = số giây (≤ thời lượng thật để học viên xem đủ % được). */
const VIDEO_INTRO = { id: "jNQXAC9IVRw", duration: 18 }; // “Me at the zoo” — 19 giây, tiện thử hoàn thành bài
const VIDEO_LONG = { id: "aqz-KE-bpKQ", duration: 600 }; // “Big Buck Bunny” — 10 phút

// ---------------------------------------------------------------------------------------------
// 1. Tổ chức

type Company = { id: string; code: string; name: string; short: string; isActive: boolean };
const COMPANIES: Omit<Company, "id">[] = [
  { code: "TONG", name: "Tập đoàn Hưng Thịnh", short: "TONG", isActive: true },
  { code: "HTTM", name: "Công ty CP Thương mại Hưng Thịnh", short: "TM", isActive: true },
  { code: "HTLOG", name: "Công ty TNHH Hưng Thịnh Logistics", short: "LOG", isActive: true },
  { code: "HTSX", name: "Công ty CP Sản xuất Hưng Thịnh", short: "SX", isActive: true },
  { code: "HTBL", name: "Công ty CP Bán lẻ Hưng Thịnh", short: "BL", isActive: true },
  { code: "HTXD", name: "Công ty CP Xây dựng Hưng Thịnh", short: "XD", isActive: true },
  { code: "HTCN", name: "Công ty TNHH Công nghệ Hưng Thịnh", short: "CN", isActive: true },
  { code: "HTBDS", name: "Công ty CP Bất động sản Hưng Thịnh", short: "BDS", isActive: true },
  { code: "HTDV", name: "Công ty TNHH Dịch vụ Hưng Thịnh", short: "DV", isActive: true },
  { code: "HTMT", name: "Công ty TNHH Hưng Thịnh Miền Trung", short: "MT", isActive: false }, // tạm ngưng
];

const POSITIONS: [string, string, boolean][] = [
  ["GD", "Giám đốc", true], ["PGD", "Phó giám đốc", true], ["TP", "Trưởng phòng", true], ["TN", "Trưởng nhóm", true],
  ["NVKD", "Nhân viên kinh doanh", true], ["KT", "Kế toán", true], ["NVHC", "Nhân viên hành chính", true],
  ["KHO", "Nhân viên kho", true], ["KTV", "Kỹ thuật viên", true], ["CSKH", "Nhân viên chăm sóc khách hàng", true],
  ["CN", "Công nhân sản xuất", true], ["TTS", "Thực tập sinh", false],
];

const CATEGORIES: [string, boolean][] = [
  ["Văn hoá – Nội quy", true], ["Quy trình", true], ["Kỹ năng mềm", true], ["An toàn lao động", true], ["Sản phẩm", true],
  ["Bán hàng", true], ["Tài chính – Kế toán", true], ["Công nghệ thông tin", true], ["Quản lý – Lãnh đạo", true],
  ["Pháp lý – Tuân thủ", true], ["Lưu trữ (không dùng)", false],
];

/** [mã công ty, mã phòng, tên, mã phòng cha?, đang hoạt động?] — cha trước con */
const DEPARTMENTS: [string, string, string, string | null, boolean][] = [
  ["TONG", "BGD", "Ban Giám đốc", null, true],
  ["TONG", "NS", "Phòng Nhân sự", null, true],
  ["TONG", "NS-TD", "Nhóm Tuyển dụng", "NS", true],
  ["TONG", "NS-DT", "Nhóm Đào tạo", "NS", true],
  ["TONG", "TCKT", "Phòng Tài chính – Kế toán", null, true],
  ["TONG", "CNTT", "Phòng Công nghệ thông tin", null, true],
  ["TONG", "PC", "Phòng Pháp chế", null, true],
  ["HTTM", "KD", "Phòng Kinh doanh", null, true],
  ["HTTM", "KD-MB", "Nhóm Kinh doanh miền Bắc", "KD", true],
  ["HTTM", "KD-MB-HN", "Tổ Kinh doanh Hà Nội", "KD-MB", true],
  ["HTTM", "KD-MN", "Nhóm Kinh doanh miền Nam", "KD", true],
  ["HTTM", "MKT", "Phòng Marketing", null, true],
  ["HTTM", "KT", "Phòng Kế toán", null, true],
  ["HTTM", "CSKH", "Phòng Chăm sóc khách hàng", null, true],
  ["HTTM", "DA", "Phòng Dự án (đã giải thể)", null, false],
  ["HTLOG", "KHO", "Phòng Kho vận", null, true],
  ["HTLOG", "KHO-HN", "Kho Hà Nội", "KHO", true],
  ["HTLOG", "KHO-HCM", "Kho TP. Hồ Chí Minh", "KHO", true],
  ["HTLOG", "VT", "Phòng Vận tải", null, true],
  ["HTSX", "SX", "Xưởng Sản xuất", null, true],
  ["HTSX", "SX-1", "Tổ Sản xuất 1", "SX", true],
  ["HTSX", "SX-2", "Tổ Sản xuất 2", "SX", true],
  ["HTSX", "QC", "Phòng Kiểm soát chất lượng", null, true],
  ["HTBL", "CH", "Phòng Vận hành cửa hàng", null, true],
  ["HTBL", "HCNS", "Phòng Hành chính – Nhân sự", null, true],
  ["HTXD", "KTHT", "Phòng Kỹ thuật – Hiện trường", null, true],
  ["HTXD", "HCNS", "Phòng Hành chính – Nhân sự", null, true],
  ["HTCN", "PTPM", "Phòng Phát triển phần mềm", null, true],
  ["HTCN", "HTKT", "Phòng Hỗ trợ kỹ thuật", null, true],
  ["HTBDS", "KD", "Phòng Kinh doanh dự án", null, true],
  ["HTBDS", "PL", "Phòng Pháp lý dự án", null, true],
  ["HTDV", "DV", "Phòng Dịch vụ khách hàng", null, true],
  ["HTDV", "HCNS", "Phòng Hành chính – Nhân sự", null, true],
  ["HTMT", "KD", "Phòng Kinh doanh", null, true],
  ["HTMT", "HCNS", "Phòng Hành chính – Nhân sự", null, true],
];

type Dept = { id: string; companyCode: string; code: string; name: string; parentCode: string | null; isActive: boolean; managerId: string | null };
type User = {
  id: string;
  code: string;
  name: string;
  role: Role;
  active: boolean;
  companyCode: string;
  deptCode: string | null;
  posCode: string | null;
  hiredAt: number;
  email: string;
  lockedUntil?: number;
  failedLoginCount?: number;
};

// ---------------------------------------------------------------------------------------------
// 2. Nội dung

type Topic = { title: string; points: string[]; video?: boolean };
type VersionDef = { type: "INITIAL" | "MINOR" | "MAJOR"; daysAgo: number; summary?: string; dueInDays?: number };
type CourseDef = {
  code: string;
  owner: string;
  category: string;
  title: string;
  description: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  selfEnroll?: boolean;
  cert?: { months: number | null };
  versions: VersionDef[];
  proposals?: { status: "PROPOSED" | "REJECTED"; daysAgo: number; summary: string; reviewNote?: string }[];
  bank: keyof typeof BANKS;
  topics: Topic[];
  quiz: { passingScore: number; maxAttempts: number | null; showAnswers: boolean };
  archivedExtra?: boolean;
};

type Q = { content: string; options: [string, boolean][]; explanation?: string; topic: string };
const q = (topic: string, content: string, options: [string, boolean][], explanation?: string): Q => ({ topic, content, options, explanation });

/** Ngân hàng câu hỏi theo nhóm nội dung — mỗi khoá dùng 1 nhóm (≥ 10 câu / khoá). */
const BANKS = {
  vanhoa: [
    q("Giá trị cốt lõi", "Giá trị cốt lõi nào của Hưng Thịnh đề cao việc giữ lời hứa với khách hàng và đồng nghiệp?", [["Chính trực", true], ["Tốc độ", false], ["Tiết kiệm", false], ["Sáng tạo", false]]),
    q("Giá trị cốt lõi", "Khi phát hiện đồng nghiệp vi phạm quy chế, bạn nên làm gì trước tiên?", [["Báo cho quản lý trực tiếp hoặc kênh tố giác", true], ["Bỏ qua để giữ hoà khí", false], ["Đăng lên mạng xã hội", false], ["Tự xử lý", false]]),
    q("Nội quy", "Giờ làm việc hành chính chuẩn của văn phòng là?", [["8:00 – 17:00, nghỉ trưa 1 tiếng", true], ["7:00 – 16:00", false], ["9:00 – 18:30", false], ["Tự do", false]]),
    q("Nội quy", "Những hành vi nào bị cấm tại nơi làm việc?", [["Sử dụng chất kích thích", true], ["Mang tài sản công ty ra ngoài khi chưa được duyệt", true], ["Uống nước tại bàn", false], ["Nghỉ giải lao 10 phút", false]]),
    q("Nội quy", "Nghỉ phép năm phải đăng ký trước tối thiểu bao lâu?", [["3 ngày làm việc", true], ["Trong ngày", false], ["1 tháng", false], ["Không cần đăng ký", false]]),
    q("Đồng phục", "Đồng phục bắt buộc mặc vào những ngày nào?", [["Thứ Hai đến thứ Sáu", true], ["Chỉ thứ Hai", false], ["Chỉ khi gặp khách", false], ["Không bắt buộc", false]]),
    q("Giao tiếp nội bộ", "Kênh chính thức để trao đổi công việc nội bộ là?", [["Email công ty và Lark", true], ["Tin nhắn cá nhân", false], ["Mạng xã hội", false], ["Giấy nhớ", false]]),
    q("Bảo mật", "Thông tin nào sau đây là thông tin mật?", [["Bảng lương nhân viên", true], ["Hợp đồng với khách hàng", true], ["Địa chỉ trụ sở", false], ["Tên công ty", false]]),
    q("Giá trị cốt lõi", "“Khách hàng là trọng tâm” nghĩa là?", [["Mọi quyết định cân nhắc lợi ích lâu dài của khách hàng", true], ["Luôn giảm giá cho khách", false], ["Chiều mọi yêu cầu kể cả trái quy định", false], ["Chỉ bộ phận kinh doanh quan tâm khách hàng", false]]),
    q("Xung đột lợi ích", "Nhận quà từ nhà cung cấp trị giá trên 500.000đ, bạn cần?", [["Khai báo và nộp lại cho phòng Pháp chế", true], ["Giữ lại dùng", false], ["Chia cho cả phòng", false], ["Từ chối nhưng không báo ai", false]]),
    q("Xung đột lợi ích", "Người thân của bạn là chủ một nhà cung cấp đang tham gia đấu thầu, bạn nên?", [["Khai báo và không tham gia đánh giá thầu", true], ["Ưu tiên chấm điểm cao", false], ["Giữ bí mật", false], ["Nghỉ phép tuần đó", false]]),
    q("Nội quy", "Đi muộn quá bao nhiêu lần trong tháng sẽ bị nhắc nhở bằng văn bản?", [["3 lần", true], ["1 lần", false], ["10 lần", false], ["Không giới hạn", false]]),
  ],
  antoan: [
    q("Bảo hộ lao động", "Trang bị bảo hộ nào bắt buộc khi vào khu vực sản xuất?", [["Mũ bảo hộ", true], ["Giày bảo hộ", true], ["Kính râm", false], ["Tai nghe nhạc", false]]),
    q("PCCC", "Bình chữa cháy CO2 KHÔNG dùng cho đám cháy nào?", [["Kim loại kiềm (natri, kali)", true], ["Thiết bị điện", false], ["Giấy, gỗ", false], ["Xăng dầu", false]]),
    q("PCCC", "Khi phát hiện cháy, việc đầu tiên cần làm là?", [["Hô hoạn và bấm chuông báo cháy", true], ["Chạy lấy đồ cá nhân", false], ["Gọi điện cho người nhà", false], ["Đi thang máy xuống", false]]),
    q("PCCC", "Số điện thoại báo cháy là?", [["114", true], ["113", false], ["115", false], ["116", false]]),
    q("Sơ cứu", "Người bị điện giật, trước tiên cần?", [["Ngắt nguồn điện", true], ["Kéo tay nạn nhân ra", false], ["Tạt nước", false], ["Gọi người khác đến xem", false]]),
    q("Sơ cứu", "Số điện thoại cấp cứu y tế là?", [["115", true], ["114", false], ["113", false], ["111", false]]),
    q("Máy móc", "Trước khi bảo trì máy, bắt buộc phải?", [["Ngắt điện và treo biển “Đang sửa chữa”", true], ["Để máy chạy chậm", false], ["Chỉ báo miệng", false], ["Không cần làm gì", false]]),
    q("Máy móc", "Quy trình LOTO dùng để?", [["Khoá và gắn thẻ nguồn năng lượng khi bảo trì", true], ["Kiểm kê kho", false], ["Chấm công", false], ["Báo cáo doanh số", false]]),
    q("Hoá chất", "Phiếu an toàn hoá chất (MSDS) cho biết điều gì?", [["Tính chất nguy hiểm và cách xử lý sự cố", true], ["Giá mua hoá chất", false], ["Nhà cung cấp rẻ nhất", false], ["Hạn thanh toán", false]]),
    q("Bảo hộ lao động", "Làm việc trên cao từ bao nhiêu mét phải đeo dây an toàn?", [["Từ 2 mét", true], ["Từ 10 mét", false], ["Từ 5 mét", false], ["Không bắt buộc", false]]),
    q("Sự cố", "Tai nạn lao động nhẹ (trầy xước) có cần báo cáo không?", [["Có, ghi vào sổ theo dõi sự cố", true], ["Không cần", false], ["Chỉ khi phải nghỉ việc", false], ["Chỉ báo người thân", false]]),
    q("PCCC", "Lối thoát hiểm phải luôn?", [["Thông thoáng, không để đồ chắn", true], ["Khoá lại để chống trộm", false], ["Dùng làm kho tạm", false], ["Tắt đèn", false]]),
  ],
  kynang: [
    q("Giao tiếp", "Lắng nghe chủ động là?", [["Tập trung, đặt câu hỏi và tóm tắt lại ý người nói", true], ["Vừa nghe vừa làm việc khác", false], ["Chờ đến lượt mình nói", false], ["Ngắt lời để góp ý ngay", false]]),
    q("Giao tiếp", "Khi phản hồi cho đồng nghiệp, nên?", [["Nói cụ thể hành vi và tác động", true], ["Nhận xét về tính cách", false], ["Phê bình trước đám đông", false], ["Im lặng cho qua", false]]),
    q("Quản lý thời gian", "Ma trận Eisenhower chia công việc theo 2 tiêu chí nào?", [["Quan trọng và khẩn cấp", true], ["Dễ và khó", false], ["Nhanh và chậm", false], ["Thích và không thích", false]]),
    q("Quản lý thời gian", "Việc “quan trọng nhưng không khẩn cấp” nên?", [["Lên lịch làm có kế hoạch", true], ["Bỏ qua", false], ["Giao cho người khác ngay", false], ["Làm ngay lập tức", false]]),
    q("Làm việc nhóm", "Dấu hiệu của một nhóm làm việc hiệu quả?", [["Mục tiêu chung rõ ràng", true], ["Phân công rõ trách nhiệm", true], ["Một người quyết mọi việc", false], ["Tránh tranh luận", false]]),
    q("Giao tiếp", "Email công việc nên có?", [["Tiêu đề rõ ràng, nội dung ngắn gọn, đề xuất hành động", true], ["Biểu tượng cảm xúc", false], ["Viết hoa toàn bộ", false], ["Không cần tiêu đề", false]]),
    q("Lãnh đạo", "Giao việc hiệu quả cần?", [["Kết quả mong muốn, thời hạn và quyền hạn rõ ràng", true], ["Chỉ nói tên công việc", false], ["Làm thay khi nhân viên chậm", false], ["Không theo dõi", false]]),
    q("Lãnh đạo", "Mục tiêu SMART có chữ “M” nghĩa là?", [["Đo lường được", true], ["Nhiều", false], ["Tạo động lực", false], ["Hằng tháng", false]]),
    q("Giải quyết vấn đề", "Phương pháp “5 Why” dùng để?", [["Tìm nguyên nhân gốc rễ", true], ["Đặt 5 mục tiêu", false], ["Phỏng vấn tuyển dụng", false], ["Tính giá thành", false]]),
    q("Làm việc nhóm", "Khi có mâu thuẫn trong nhóm, nên?", [["Trao đổi trực tiếp, tập trung vào vấn đề", true], ["Nói xấu sau lưng", false], ["Báo cáo ngay lên giám đốc", false], ["Né tránh", false]]),
    q("Quản lý thời gian", "Kỹ thuật Pomodoro chia thời gian làm việc thành?", [["Các khoảng 25 phút, nghỉ ngắn giữa các khoảng", true], ["Ca 8 tiếng", false], ["Mỗi giờ nghỉ 30 phút", false], ["Làm liên tục không nghỉ", false]]),
    q("Lãnh đạo", "Họp 1-1 định kỳ với nhân viên nhằm?", [["Lắng nghe, hỗ trợ và phát triển nhân viên", true], ["Kiểm tra giờ làm", false], ["Thông báo kỷ luật", false], ["Thay cho đánh giá cuối năm", false]]),
  ],
  cntt: [
    q("Mật khẩu", "Mật khẩu nào an toàn nhất?", [["Hung!Thinh#2026-Kho", true], ["123456789", false], ["ngaysinh1990", false], ["password", false]]),
    q("Lừa đảo", "Dấu hiệu email lừa đảo (phishing)?", [["Thúc giục, đe doạ khoá tài khoản", true], ["Đường link lạ, sai tên miền", true], ["Gửi từ email công ty đúng tên miền", false], ["Có chữ ký đầy đủ", false]]),
    q("Lừa đảo", "Nhận được email nghi lừa đảo, bạn nên?", [["Không bấm link, báo phòng CNTT", true], ["Bấm thử xem", false], ["Chuyển tiếp cho cả phòng", false], ["Trả lời hỏi lại", false]]),
    q("Thiết bị", "Rời bàn làm việc, cần?", [["Khoá màn hình (Windows + L)", true], ["Tắt màn hình", false], ["Để nguyên", false], ["Úp bàn phím", false]]),
    q("Dữ liệu", "Lưu tài liệu công việc ở đâu?", [["Ổ lưu trữ công ty / Lark Drive", true], ["USB cá nhân", false], ["Google Drive cá nhân", false], ["Màn hình desktop", false]]),
    q("Mật khẩu", "Xác thực 2 lớp (2FA) giúp?", [["Bảo vệ tài khoản khi lộ mật khẩu", true], ["Đăng nhập nhanh hơn", false], ["Không cần mật khẩu", false], ["Tăng dung lượng", false]]),
    q("Thiết bị", "Cắm USB lạ nhặt được vào máy công ty là?", [["Không được phép", true], ["Được nếu quét virus", false], ["Được nếu là USB mới", false], ["Được nếu tắt mạng", false]]),
    q("Dữ liệu", "Gửi dữ liệu khách hàng ra ngoài cần?", [["Được phê duyệt và mã hoá", true], ["Gửi qua Zalo cá nhân", false], ["Gửi bất kỳ", false], ["In ra giấy", false]]),
    q("Lừa đảo", "Cuộc gọi tự xưng “phòng CNTT” xin mật khẩu, bạn?", [["Từ chối, CNTT không bao giờ hỏi mật khẩu", true], ["Đọc mật khẩu", false], ["Gửi qua email", false], ["Đổi mật khẩu rồi gửi", false]]),
    q("Phát triển phần mềm", "Mã nguồn được đưa lên nhánh chính khi?", [["Đã được review và kiểm thử tự động xanh", true], ["Lập trình viên thấy ổn", false], ["Cuối ngày", false], ["Bất kỳ lúc nào", false]]),
    q("Phát triển phần mềm", "Không được lưu gì trong mã nguồn?", [["Mật khẩu, khoá bí mật", true], ["Chú thích", false], ["Tên hàm", false], ["Kiểm thử", false]]),
    q("Thiết bị", "Mất laptop công ty, cần báo phòng CNTT trong vòng?", [["Ngay lập tức (trong 1 giờ)", true], ["1 tuần", false], ["Cuối tháng", false], ["Không cần", false]]),
  ],
  kinhdoanh: [
    q("Tư vấn", "Bước đầu tiên của bán hàng tư vấn là?", [["Tìm hiểu nhu cầu khách hàng", true], ["Báo giá", false], ["Chốt đơn", false], ["Giới thiệu khuyến mãi", false]]),
    q("Tư vấn", "Câu hỏi mở giúp?", [["Khách hàng chia sẻ nhiều thông tin hơn", true], ["Kết thúc cuộc gọi nhanh", false], ["Khách chỉ trả lời có / không", false], ["Tránh phản đối", false]]),
    q("Xử lý từ chối", "Khách nói “giá cao quá”, nên?", [["Làm rõ giá trị và so sánh tổng chi phí", true], ["Giảm giá ngay", false], ["Kết thúc tư vấn", false], ["Chê đối thủ", false]]),
    q("Sản phẩm", "Bảo hành tiêu chuẩn của dòng sản phẩm HT-Pro là?", [["24 tháng", true], ["6 tháng", false], ["12 tháng", false], ["Trọn đời", false]]),
    q("Sản phẩm", "Ưu điểm chính của dòng HT-Eco?", [["Tiết kiệm điện", true], ["Vật liệu tái chế", true], ["Giá cao nhất thị trường", false], ["Không cần bảo trì", false]]),
    q("Chăm sóc khách hàng", "Thời gian phản hồi khiếu nại tối đa là?", [["24 giờ làm việc", true], ["1 tuần", false], ["Khi rảnh", false], ["1 tháng", false]]),
    q("Chăm sóc khách hàng", "Khi khách hàng bức xúc, nên?", [["Lắng nghe, xin lỗi về trải nghiệm và đưa hướng xử lý", true], ["Tranh luận đúng sai", false], ["Chuyển máy liên tục", false], ["Cúp máy", false]]),
    q("Quy trình bán hàng", "Đơn hàng trên 100 triệu cần?", [["Trưởng phòng Kinh doanh duyệt", true], ["Không cần duyệt", false], ["Kế toán duyệt", false], ["Khách tự duyệt", false]]),
    q("Quy trình bán hàng", "Thông tin khách hàng mới phải nhập vào?", [["Hệ thống CRM trong ngày", true], ["Sổ tay cá nhân", false], ["Excel trên máy", false], ["Không cần lưu", false]]),
    q("Sản phẩm", "Sản phẩm HT-Pro 2026 có gì mới?", [["Kết nối ứng dụng di động", true], ["Không có gì mới", false], ["Bỏ bảo hành", false], ["Chỉ đổi màu", false]]),
    q("Xử lý từ chối", "Khách “để suy nghĩ thêm”, nên?", [["Hỏi điều còn băn khoăn và hẹn lịch liên hệ lại", true], ["Ép chốt ngay", false], ["Không liên hệ nữa", false], ["Gọi 5 lần mỗi ngày", false]]),
    q("Chăm sóc khách hàng", "Chỉ số CSAT đo?", [["Mức độ hài lòng của khách hàng", true], ["Doanh số", false], ["Số cuộc gọi", false], ["Chi phí", false]]),
  ],
  quytrinh: [
    q("Nhập kho", "Khi nhận hàng, cần đối chiếu với chứng từ nào?", [["Phiếu giao hàng và đơn đặt hàng", true], ["Hoá đơn tiền điện", false], ["Bảng lương", false], ["Không cần đối chiếu", false]]),
    q("Nhập kho", "Hàng nhận về bị móp méo, bạn?", [["Lập biên bản với bên giao và chụp ảnh", true], ["Nhận bình thường", false], ["Tự sửa", false], ["Bỏ đi", false]]),
    q("Xuất kho", "Nguyên tắc FIFO nghĩa là?", [["Hàng nhập trước xuất trước", true], ["Hàng nhập sau xuất trước", false], ["Xuất hàng rẻ trước", false], ["Xuất ngẫu nhiên", false]]),
    q("Xuất kho", "Xuất kho cần chứng từ?", [["Phiếu xuất kho có chữ ký duyệt", true], ["Tin nhắn Zalo", false], ["Lời nói của khách", false], ["Không cần", false]]),
    q("Kiểm kê", "Kiểm kê kho định kỳ bao lâu một lần?", [["Hằng tháng", true], ["10 năm", false], ["Khi mất hàng", false], ["Không kiểm kê", false]]),
    q("Thanh toán", "Đề nghị tạm ứng cần hoàn ứng trong bao lâu sau khi xong việc?", [["15 ngày", true], ["1 năm", false], ["Không cần hoàn ứng", false], ["1 ngày", false]]),
    q("Thanh toán", "Chứng từ thanh toán hợp lệ gồm?", [["Hoá đơn VAT đúng thông tin công ty", true], ["Đề nghị thanh toán có duyệt", true], ["Ảnh chụp màn hình chuyển khoản cá nhân", false], ["Giấy viết tay không chữ ký", false]]),
    q("Chất lượng", "Sản phẩm lỗi phát hiện ở công đoạn QC phải?", [["Gắn thẻ đỏ, tách khỏi lô đạt", true], ["Trộn lẫn lô đạt", false], ["Giao cho khách", false], ["Vứt bỏ không ghi nhận", false]]),
    q("Chất lượng", "ISO 9001 là tiêu chuẩn về?", [["Hệ thống quản lý chất lượng", true], ["An toàn thực phẩm", false], ["Môi trường", false], ["Kế toán", false]]),
    q("Chăm sóc khách hàng", "Phiếu yêu cầu hỗ trợ phải được phân loại trong?", [["2 giờ làm việc", true], ["1 tuần", false], ["1 tháng", false], ["Không cần phân loại", false]]),
    q("Xuất kho", "Hàng có hạn sử dụng nên xuất theo nguyên tắc?", [["FEFO — hết hạn trước xuất trước", true], ["LIFO", false], ["Ngẫu nhiên", false], ["Theo màu sắc", false]]),
    q("Thanh toán", "Khoản chi trên 50 triệu cần ai duyệt?", [["Giám đốc tài chính", true], ["Nhân viên kế toán", false], ["Thủ quỹ", false], ["Không cần duyệt", false]]),
  ],
};

const MINOR_SUMMARY = (what: string) =>
  `<p>Cập nhật nhỏ: ${what}</p><ul><li>Bổ sung ví dụ thực tế ở chương 2.</li><li>Sửa lỗi chính tả, cập nhật số điện thoại liên hệ.</li></ul><p>Bạn chỉ cần đọc phần thay đổi và bấm xác nhận.</p>`;
const MAJOR_SUMMARY = (what: string) =>
  `<p><b>Thay đổi lớn:</b> ${what}</p><ul><li>Viết lại toàn bộ quy trình theo quy định mới.</li><li>Bài kiểm tra cuối khoá có câu hỏi mới.</li></ul><p>Người đã học cần học lại và làm lại bài kiểm tra.</p>`;

const COURSES: CourseDef[] = [
  {
    code: "VH-01", owner: "TONG", category: "Văn hoá – Nội quy", title: "Văn hoá doanh nghiệp Hưng Thịnh",
    description: "Lịch sử hình thành, tầm nhìn – sứ mệnh và 5 giá trị cốt lõi của Tập đoàn Hưng Thịnh. Bắt buộc với mọi nhân viên.",
    status: "PUBLISHED", cert: { months: null }, versions: [{ type: "INITIAL", daysAgo: 330 }], bank: "vanhoa",
    topics: [
      { title: "Lịch sử và tầm nhìn", points: ["Thành lập năm 2001 tại Hà Nội, hiện có 9 công ty thành viên.", "Tầm nhìn 2030: dẫn đầu thương mại – logistics khu vực phía Bắc.", "Sứ mệnh: mang sản phẩm chất lượng đến mọi gia đình Việt."], video: true },
      { title: "5 giá trị cốt lõi", points: ["Chính trực — nói đi đôi với làm.", "Khách hàng là trọng tâm.", "Hợp tác — thành công của tập thể.", "Học hỏi không ngừng.", "Trách nhiệm với cộng đồng."] },
      { title: "Ứng xử hằng ngày", points: ["Chào hỏi, đúng giờ, giữ gìn không gian chung.", "Tôn trọng sự khác biệt.", "Phản hồi thẳng thắn, xây dựng."] },
    ],
    quiz: { passingScore: 70, maxAttempts: null, showAnswers: true },
  },
  {
    code: "NQ-01", owner: "TONG", category: "Văn hoá – Nội quy", title: "Nội quy lao động và quy chế làm việc",
    description: "Thời giờ làm việc, nghỉ phép, đồng phục, kỷ luật lao động và các hành vi bị cấm.",
    status: "PUBLISHED", versions: [{ type: "INITIAL", daysAgo: 320 }, { type: "MINOR", daysAgo: 12, dueInDays: 14, summary: MINOR_SUMMARY("cập nhật quy định nghỉ phép năm 2027 và giờ làm việc mùa hè.") }],
    bank: "vanhoa",
    topics: [
      { title: "Thời giờ làm việc", points: ["Giờ hành chính 8:00 – 17:00, nghỉ trưa 12:00 – 13:00.", "Chấm công bằng vân tay hoặc ứng dụng Lark.", "Đi muộn 3 lần / tháng bị nhắc nhở bằng văn bản."] },
      { title: "Nghỉ phép và chế độ", points: ["12 ngày phép năm, cộng 1 ngày mỗi 5 năm thâm niên.", "Đăng ký nghỉ trước 3 ngày làm việc.", "Nghỉ ốm cần giấy xác nhận của cơ sở y tế."] },
      { title: "Kỷ luật lao động", points: ["Các hình thức: khiển trách, kéo dài nâng lương, sa thải.", "Hành vi bị cấm: chất kích thích, mang tài sản công ty ra ngoài khi chưa duyệt."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: false },
  },
  {
    code: "AT-01", owner: "TONG", category: "An toàn lao động", title: "An toàn lao động cơ bản",
    description: "Huấn luyện an toàn – vệ sinh lao động theo Nghị định 44/2016/NĐ-CP cho mọi nhân viên. Chứng nhận hiệu lực 12 tháng.",
    status: "PUBLISHED", cert: { months: 12 },
    versions: [
      { type: "INITIAL", daysAgo: 360 },
      { type: "MINOR", daysAgo: 200, dueInDays: 14, summary: MINOR_SUMMARY("bổ sung hình ảnh trang bị bảo hộ mới.") },
      { type: "MAJOR", daysAgo: 25, dueInDays: 30, summary: MAJOR_SUMMARY("áp dụng quy trình LOTO và quy định làm việc trên cao mới từ 01/11/2026.") },
    ],
    bank: "antoan",
    topics: [
      { title: "Trang bị bảo hộ cá nhân", points: ["Mũ, giày, găng tay, kính theo từng khu vực.", "Kiểm tra trang bị trước mỗi ca làm.", "Làm việc trên cao từ 2 m phải đeo dây an toàn."], video: true },
      { title: "An toàn máy móc và điện", points: ["Áp dụng LOTO khi bảo trì.", "Không tự ý tháo che chắn an toàn.", "Ngắt nguồn trước khi xử lý người bị điện giật."] },
      { title: "Báo cáo sự cố", points: ["Mọi sự cố, kể cả nhẹ, ghi vào sổ theo dõi.", "Báo trưởng ca trong vòng 1 giờ."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: true },
    archivedExtra: true,
  },
  {
    code: "AT-02", owner: "TONG", category: "An toàn lao động", title: "Phòng cháy chữa cháy tại nơi làm việc",
    description: "Nhận biết nguy cơ cháy nổ, sử dụng bình chữa cháy, thoát nạn an toàn. Chứng nhận hiệu lực 6 tháng.",
    status: "PUBLISHED", cert: { months: 6 }, versions: [{ type: "INITIAL", daysAgo: 300 }], bank: "antoan",
    topics: [
      { title: "Nguyên nhân gây cháy", points: ["Chập điện, quá tải ổ cắm.", "Hút thuốc sai nơi quy định.", "Lưu trữ hoá chất không đúng cách."] },
      { title: "Sử dụng bình chữa cháy", points: ["Bình bột ABC cho đa số đám cháy.", "Bình CO2 cho thiết bị điện, không dùng cho kim loại kiềm.", "Đứng đầu hướng gió, phun vào gốc lửa."], video: true },
      { title: "Thoát nạn", points: ["Bình tĩnh, theo biển chỉ dẫn lối thoát.", "Không dùng thang máy.", "Tập trung tại điểm tập kết, điểm danh."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: true },
  },
  {
    code: "KN-01", owner: "TONG", category: "Kỹ năng mềm", title: "Kỹ năng giao tiếp hiệu quả",
    description: "Lắng nghe chủ động, phản hồi xây dựng và viết email công việc chuyên nghiệp.",
    status: "PUBLISHED", selfEnroll: true, versions: [{ type: "INITIAL", daysAgo: 280 }], bank: "kynang",
    topics: [
      { title: "Lắng nghe chủ động", points: ["Tập trung, không ngắt lời.", "Đặt câu hỏi làm rõ.", "Tóm tắt lại ý chính."], video: true },
      { title: "Phản hồi xây dựng", points: ["Mô hình SBI: Tình huống – Hành vi – Tác động.", "Khen trước đám đông, góp ý riêng."] },
      { title: "Email chuyên nghiệp", points: ["Tiêu đề rõ, nội dung ngắn.", "Nêu rõ hành động mong muốn và thời hạn."] },
    ],
    quiz: { passingScore: 60, maxAttempts: null, showAnswers: true },
  },
  {
    code: "KN-02", owner: "TONG", category: "Kỹ năng mềm", title: "Quản lý thời gian và ưu tiên công việc",
    description: "Ma trận Eisenhower, kỹ thuật Pomodoro và lập kế hoạch tuần.",
    status: "PUBLISHED", selfEnroll: true, cert: { months: null }, versions: [{ type: "INITIAL", daysAgo: 260 }], bank: "kynang",
    topics: [
      { title: "Ma trận Eisenhower", points: ["Quan trọng & khẩn cấp: làm ngay.", "Quan trọng & không khẩn cấp: lên lịch.", "Không quan trọng & khẩn cấp: giao việc.", "Còn lại: loại bỏ."] },
      { title: "Pomodoro và tập trung", points: ["25 phút tập trung, nghỉ 5 phút.", "Tắt thông báo khi làm việc sâu."], video: true },
    ],
    quiz: { passingScore: 70, maxAttempts: null, showAnswers: true },
  },
  {
    code: "IT-01", owner: "TONG", category: "Công nghệ thông tin", title: "An toàn thông tin cho nhân viên",
    description: "Mật khẩu mạnh, nhận diện email lừa đảo, bảo vệ dữ liệu công ty. Chứng nhận hiệu lực 12 tháng.",
    status: "PUBLISHED", cert: { months: 12 }, versions: [{ type: "INITIAL", daysAgo: 240 }],
    proposals: [
      { status: "REJECTED", daysAgo: 60, summary: MAJOR_SUMMARY("thêm phần bảo mật thiết bị di động."), reviewNote: "Nội dung chưa đủ, cần bổ sung quy định BYOD trước khi phát hành." },
      { status: "PROPOSED", daysAgo: 3, summary: MAJOR_SUMMARY("cập nhật quy định bảo vệ dữ liệu cá nhân theo Nghị định 13/2023/NĐ-CP.") },
    ],
    bank: "cntt",
    topics: [
      { title: "Mật khẩu và xác thực", points: ["Mật khẩu ≥ 12 ký tự, có chữ, số, ký tự đặc biệt.", "Bật xác thực 2 lớp cho email và Lark.", "Không dùng chung mật khẩu."] },
      { title: "Nhận diện lừa đảo", points: ["Kiểm tra tên miền người gửi.", "Không bấm link lạ, không mở file đính kèm đáng ngờ.", "Báo phòng CNTT qua email it@hungthinh.vn."], video: true },
      { title: "Bảo vệ dữ liệu", points: ["Khoá màn hình khi rời bàn.", "Lưu tài liệu trên Lark Drive công ty.", "Không cắm USB lạ."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 2, showAnswers: false },
  },
  {
    code: "QL-01", owner: "TONG", category: "Quản lý – Lãnh đạo", title: "Kỹ năng lãnh đạo cho quản lý cấp trung",
    description: "Giao việc, đặt mục tiêu SMART, họp 1-1 và phát triển đội ngũ.",
    status: "PUBLISHED", selfEnroll: true, cert: { months: null }, versions: [{ type: "INITIAL", daysAgo: 220 }], bank: "kynang",
    topics: [
      { title: "Đặt mục tiêu SMART", points: ["Cụ thể, đo lường được, khả thi, liên quan, có thời hạn."] },
      { title: "Giao việc và theo dõi", points: ["Nói rõ kết quả mong muốn, thời hạn, quyền hạn.", "Theo dõi theo mốc, không làm thay."], video: true },
      { title: "Họp 1-1", points: ["30 phút mỗi 2 tuần.", "Nhân viên nói nhiều hơn quản lý.", "Ghi chép cam kết hai bên."] },
    ],
    quiz: { passingScore: 70, maxAttempts: null, showAnswers: true },
  },
  {
    code: "PL-01", owner: "TONG", category: "Pháp lý – Tuân thủ", title: "Phòng chống tham nhũng và xung đột lợi ích",
    description: "Quy định nhận quà tặng, khai báo xung đột lợi ích và kênh tố giác.",
    status: "PUBLISHED", versions: [{ type: "INITIAL", daysAgo: 200 }], bank: "vanhoa",
    topics: [
      { title: "Quà tặng và chiêu đãi", points: ["Quà trên 500.000đ phải khai báo.", "Không nhận tiền mặt dưới mọi hình thức."] },
      { title: "Xung đột lợi ích", points: ["Khai báo khi người thân là đối tác.", "Không tham gia quyết định liên quan."] },
      { title: "Kênh tố giác", points: ["Email tuanthu@hungthinh.vn, bảo mật danh tính người tố giác."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: false },
  },
  {
    code: "TC-01", owner: "TONG", category: "Tài chính – Kế toán", title: "Quy trình thanh toán và hoàn ứng",
    description: "Đề nghị tạm ứng, hoàn ứng, chứng từ hợp lệ và hạn mức phê duyệt.",
    status: "PUBLISHED", versions: [{ type: "INITIAL", daysAgo: 180 }], bank: "quytrinh",
    topics: [
      { title: "Tạm ứng", points: ["Lập đề nghị tạm ứng trên hệ thống.", "Hoàn ứng trong 15 ngày sau khi xong việc."] },
      { title: "Chứng từ hợp lệ", points: ["Hoá đơn VAT đúng tên, mã số thuế công ty.", "Đề nghị thanh toán có chữ ký duyệt."] },
      { title: "Hạn mức phê duyệt", points: ["Dưới 10 triệu: trưởng phòng.", "10 – 50 triệu: kế toán trưởng.", "Trên 50 triệu: giám đốc tài chính."] },
    ],
    quiz: { passingScore: 70, maxAttempts: 3, showAnswers: true },
  },
  {
    code: "KN-03", owner: "TONG", category: "Kỹ năng mềm", title: "Tư duy phản biện và giải quyết vấn đề",
    description: "Khoá đang soạn — phương pháp 5 Why, sơ đồ xương cá.", status: "DRAFT", versions: [], bank: "kynang",
    topics: [{ title: "Phương pháp 5 Why", points: ["Hỏi “tại sao” liên tiếp để tìm nguyên nhân gốc."] }, { title: "Sơ đồ xương cá", points: ["Phân tích nguyên nhân theo nhóm 6M."] }],
    quiz: { passingScore: 70, maxAttempts: null, showAnswers: true },
  },
  {
    code: "HN-2025", owner: "TONG", category: "Văn hoá – Nội quy", title: "Hội nhập nhân viên mới (bản 2025)",
    description: "Khoá cũ đã thay bằng lộ trình “Hội nhập nhân viên mới”. Lưu trữ để giữ lịch sử học.",
    status: "ARCHIVED", versions: [{ type: "INITIAL", daysAgo: 400 }], bank: "vanhoa",
    topics: [{ title: "Chào mừng đến Hưng Thịnh", points: ["Giới thiệu sơ đồ tổ chức.", "Các phòng ban hỗ trợ."] }, { title: "Ngày làm việc đầu tiên", points: ["Nhận thiết bị, tài khoản.", "Gặp người hướng dẫn."] }],
    quiz: { passingScore: 60, maxAttempts: null, showAnswers: true },
  },
  {
    code: "TM-BH-01", owner: "HTTM", category: "Bán hàng", title: "Kỹ năng bán hàng tư vấn",
    description: "Quy trình 5 bước bán hàng tư vấn, khai thác nhu cầu và xử lý từ chối. Chứng nhận hiệu lực 12 tháng.",
    status: "PUBLISHED", selfEnroll: true, cert: { months: 12 }, versions: [{ type: "INITIAL", daysAgo: 250 }], bank: "kinhdoanh",
    topics: [
      { title: "Khai thác nhu cầu", points: ["Câu hỏi mở – câu hỏi đóng.", "Mô hình SPIN."], video: true },
      { title: "Trình bày giải pháp", points: ["Nói lợi ích, không chỉ tính năng.", "Dùng câu chuyện khách hàng thật."] },
      { title: "Xử lý từ chối và chốt đơn", points: ["“Giá cao”: so sánh tổng chi phí sở hữu.", "“Để suy nghĩ”: hỏi điều còn băn khoăn."] },
    ],
    quiz: { passingScore: 70, maxAttempts: 3, showAnswers: true },
  },
  {
    code: "TM-SP-01", owner: "HTTM", category: "Sản phẩm", title: "Kiến thức sản phẩm Hưng Thịnh 2026",
    description: "Dòng sản phẩm HT-Pro, HT-Eco: tính năng, chính sách bảo hành, so sánh đối thủ.",
    status: "PUBLISHED",
    versions: [
      { type: "INITIAL", daysAgo: 230 },
      { type: "MAJOR", daysAgo: 40, dueInDays: 30, summary: MAJOR_SUMMARY("ra mắt dòng HT-Pro 2026 thay thế toàn bộ dòng cũ, chính sách bảo hành mới 24 tháng.") },
    ],
    bank: "kinhdoanh",
    topics: [
      { title: "Dòng HT-Pro 2026", points: ["Kết nối ứng dụng di động.", "Bảo hành 24 tháng."], video: true },
      { title: "Dòng HT-Eco", points: ["Tiết kiệm điện 30%.", "Vỏ từ vật liệu tái chế."] },
      { title: "So sánh đối thủ", points: ["Ưu thế: bảo hành và mạng lưới sửa chữa 63 tỉnh."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: false },
  },
  {
    code: "TM-QT-01", owner: "HTTM", category: "Quy trình", title: "Quy trình chăm sóc khách hàng",
    description: "Tiếp nhận, phân loại, xử lý và đóng phiếu hỗ trợ; xử lý khiếu nại.",
    status: "PUBLISHED", versions: [{ type: "INITIAL", daysAgo: 210 }, { type: "MINOR", daysAgo: 30, dueInDays: 14, summary: MINOR_SUMMARY("rút thời gian phân loại phiếu hỗ trợ xuống 2 giờ.") }],
    bank: "kinhdoanh",
    topics: [
      { title: "Tiếp nhận yêu cầu", points: ["Ghi nhận trên CRM trong ngày.", "Phân loại trong 2 giờ làm việc."] },
      { title: "Xử lý khiếu nại", points: ["Phản hồi trong 24 giờ.", "Lắng nghe – xin lỗi – giải pháp – theo dõi."] },
    ],
    quiz: { passingScore: 70, maxAttempts: null, showAnswers: true },
  },
  {
    code: "LOG-QT-01", owner: "HTLOG", category: "Quy trình", title: "Quy trình nhập – xuất kho",
    description: "Nhận hàng, kiểm đếm, nhập kho, xuất kho theo FIFO/FEFO và kiểm kê định kỳ. Chứng nhận vĩnh viễn.",
    status: "PUBLISHED", cert: { months: null }, versions: [{ type: "INITIAL", daysAgo: 270 }], bank: "quytrinh",
    topics: [
      { title: "Nhận hàng và nhập kho", points: ["Đối chiếu phiếu giao hàng với đơn đặt hàng.", "Hàng hỏng: lập biên bản, chụp ảnh."], video: true },
      { title: "Xuất kho", points: ["FIFO cho hàng thường, FEFO cho hàng có hạn dùng.", "Phiếu xuất kho có chữ ký duyệt."] },
      { title: "Kiểm kê", points: ["Kiểm kê hằng tháng, đối chiếu sổ sách."] },
    ],
    quiz: { passingScore: 70, maxAttempts: 3, showAnswers: true },
  },
  {
    code: "SX-AT-01", owner: "HTSX", category: "An toàn lao động", title: "Vận hành máy móc an toàn",
    description: "An toàn khi vận hành máy dập, máy cắt, xe nâng trong xưởng. Chứng nhận hiệu lực 12 tháng.",
    status: "PUBLISHED", cert: { months: 12 }, versions: [{ type: "INITIAL", daysAgo: 290 }], bank: "antoan",
    topics: [
      { title: "Trước khi vận hành", points: ["Kiểm tra che chắn, nút dừng khẩn cấp.", "Chỉ người được đào tạo mới vận hành."], video: true },
      { title: "Bảo trì an toàn (LOTO)", points: ["Ngắt nguồn, khoá, gắn thẻ.", "Thử khởi động để xác nhận đã ngắt."] },
    ],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: true },
  },
  {
    code: "SX-QC-01", owner: "HTSX", category: "Quy trình", title: "Kiểm soát chất lượng sản phẩm (ISO 9001)",
    description: "Khoá đang soạn — quy trình QC đầu vào, trong quá trình và thành phẩm.", status: "DRAFT", versions: [], bank: "quytrinh",
    topics: [{ title: "ISO 9001 là gì", points: ["Tiêu chuẩn hệ thống quản lý chất lượng."] }, { title: "Xử lý hàng lỗi", points: ["Gắn thẻ đỏ, tách khỏi lô đạt."] }],
    quiz: { passingScore: 80, maxAttempts: 3, showAnswers: true },
  },
  {
    code: "CN-PM-01", owner: "HTCN", category: "Công nghệ thông tin", title: "Quy trình phát triển phần mềm",
    description: "Quy trình Git, review mã nguồn, kiểm thử tự động và phát hành.",
    status: "PUBLISHED", versions: [{ type: "INITIAL", daysAgo: 150 }], bank: "cntt",
    topics: [
      { title: "Git và review mã", points: ["Mỗi thay đổi một nhánh, có Pull Request.", "Tối thiểu 1 người review."], video: true },
      { title: "Kiểm thử và phát hành", points: ["Kiểm thử tự động phải xanh.", "Không lưu mật khẩu trong mã nguồn."] },
    ],
    quiz: { passingScore: 70, maxAttempts: null, showAnswers: true },
  },
];

/** [mã, chủ sở hữu, tên, trạng thái, mã khoá theo thứ tự, mô tả] */
const PATHS: [string, string, string, "PUBLISHED" | "DRAFT" | "ARCHIVED", string[], string][] = [
  ["LT-HN-01", "TONG", "Hội nhập nhân viên mới", "PUBLISHED", ["VH-01", "NQ-01", "AT-01"], "3 khoá bắt buộc trong 30 ngày đầu tiên."],
  ["LT-AT", "TONG", "An toàn toàn diện", "PUBLISHED", ["AT-01", "AT-02"], "An toàn lao động và phòng cháy chữa cháy."],
  ["LT-KN", "TONG", "Phát triển kỹ năng mềm", "PUBLISHED", ["KN-01", "KN-02"], "Giao tiếp và quản lý thời gian."],
  ["LT-QL", "TONG", "Quản lý cấp trung", "PUBLISHED", ["QL-01", "KN-02", "PL-01"], "Dành cho trưởng nhóm, trưởng phòng mới bổ nhiệm."],
  ["LT-TT", "TONG", "Tuân thủ và bảo mật", "PUBLISHED", ["PL-01", "IT-01"], "Phòng chống tham nhũng và an toàn thông tin."],
  ["LT-TC", "TONG", "Tài chính cho người không chuyên", "DRAFT", ["TC-01", "KN-02"], "Đang soạn."],
  ["LT-HN-2025", "TONG", "Hội nhập 2025 (cũ)", "ARCHIVED", ["VH-01", "NQ-01"], "Đã thay bằng “Hội nhập nhân viên mới”."],
  ["LT-KD", "HTTM", "Hội nhập Kinh doanh 30 ngày", "PUBLISHED", ["VH-01", "TM-SP-01", "TM-BH-01", "TM-QT-01"], "Nhân viên kinh doanh mới học tuần tự 4 khoá."],
  ["LT-KHO", "HTLOG", "Nhân viên kho mới", "PUBLISHED", ["AT-01", "LOG-QT-01"], "An toàn lao động rồi quy trình kho."],
  ["LT-SX", "HTSX", "Công nhân sản xuất mới", "PUBLISHED", ["AT-01", "SX-AT-01", "AT-02"], "3 khoá an toàn bắt buộc trước khi vào xưởng."],
];

/** Quy tắc giao: [chủ sở hữu, tên, khoá | lộ trình, công ty đích (null = mọi công ty), phòng ban, chức danh, hạn (ngày), đang bật, tạo cách đây (ngày)] */
type RuleDef = { owner: string; name: string; course?: string; path?: string; target: string | null; dept?: string; pos?: string; due: number; active: boolean; daysAgo: number };
const RULES: RuleDef[] = [
  { owner: "TONG", name: "Toàn tập đoàn — Văn hoá doanh nghiệp", course: "VH-01", target: null, due: 30, active: true, daysAgo: 320 },
  { owner: "TONG", name: "Toàn tập đoàn — An toàn lao động cơ bản", course: "AT-01", target: null, due: 30, active: true, daysAgo: 350 },
  { owner: "TONG", name: "Toàn tập đoàn — Nội quy lao động", course: "NQ-01", target: null, due: 21, active: true, daysAgo: 310 },
  { owner: "TONG", name: "Khối văn phòng tập đoàn — An toàn thông tin", course: "IT-01", target: "TONG", due: 30, active: true, daysAgo: 230 },
  { owner: "TONG", name: "Trưởng phòng toàn tập đoàn — Kỹ năng lãnh đạo", course: "QL-01", target: null, pos: "TP", due: 60, active: true, daysAgo: 200 },
  { owner: "TONG", name: "Sản xuất — Phòng cháy chữa cháy", course: "AT-02", target: "HTSX", due: 30, active: true, daysAgo: 290 },
  { owner: "TONG", name: "Kế toán tập đoàn — Thanh toán & hoàn ứng", course: "TC-01", target: "TONG", dept: "TCKT", due: 30, active: true, daysAgo: 170 },
  { owner: "HTTM", name: "KD miền Bắc — Lộ trình hội nhập Kinh doanh", path: "LT-KD", target: "HTTM", dept: "KD-MB", due: 45, active: true, daysAgo: 220 },
  { owner: "HTTM", name: "Phòng Kinh doanh — Bán hàng tư vấn", course: "TM-BH-01", target: "HTTM", dept: "KD", due: 45, active: true, daysAgo: 240 },
  { owner: "HTTM", name: "CSKH — Quy trình chăm sóc khách hàng", course: "TM-QT-01", target: "HTTM", dept: "CSKH", due: 21, active: true, daysAgo: 200 },
  { owner: "HTLOG", name: "Kho vận — Lộ trình nhân viên kho mới", path: "LT-KHO", target: "HTLOG", dept: "KHO", due: 30, active: true, daysAgo: 260 },
  { owner: "HTSX", name: "Xưởng — Vận hành máy móc an toàn", course: "SX-AT-01", target: "HTSX", dept: "SX", due: 30, active: true, daysAgo: 280 },
  { owner: "HTCN", name: "Phát triển phần mềm — Quy trình (tạm dừng)", course: "CN-PM-01", target: "HTCN", dept: "PTPM", due: 30, active: false, daysAgo: 140 },
  { owner: "TONG", name: "Pháp chế — Phòng chống tham nhũng (tạm dừng)", course: "PL-01", target: "TONG", dept: "PC", due: 30, active: false, daysAgo: 190 },
];

// ---------------------------------------------------------------------------------------------

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

const counts = new Map<string, number>();
async function insert<T>(label: string, rows: T[], fn: (data: T[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += 2000) await fn(rows.slice(i, i + 2000));
  counts.set(label, (counts.get(label) ?? 0) + rows.length);
}

async function main() {
  console.log(`→ Nạp dữ liệu demo vào database "${dbName}" (xoá sạch dữ liệu cũ)...`);
  await wipe();
  const passwordHash = await bcrypt.hash(PASSWORD, 12);

  // ---------------- Công ty, chức danh, danh mục ----------------
  const companies: Company[] = COMPANIES.map((c) => ({ ...c, id: newId() }));
  const company = (code: string) => companies.find((c) => c.code === code)!;
  const tong = company("TONG");
  await insert("companies", companies, (d) =>
    prisma.company.createMany({
      data: d.map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        parentId: c.code === "TONG" ? null : tong.id,
        isActive: c.isActive,
        certificateSignerName: c.code === "TONG" ? "Nguyễn Văn Thịnh" : c.code === "HTTM" ? "Trần Thị Mai" : null,
        certificateSignerTitle: c.code === "TONG" ? "Tổng Giám đốc" : c.code === "HTTM" ? "Giám đốc Nhân sự" : null,
        createdAt: at(ago(420)),
        updatedAt: at(ago(c.isActive ? 420 : 15)),
      })),
    }),
  );

  const positions = POSITIONS.map(([code, name, isActive]) => ({ id: newId(), code, name, isActive, createdAt: at(ago(420)) }));
  await insert("positions", positions, (d) => prisma.position.createMany({ data: d }));
  const posId = (code: string | null) => (code ? positions.find((p) => p.code === code)!.id : null);

  const categories = CATEGORIES.map(([name, isActive], i) => ({ id: newId(), name, sortOrder: i, isActive, createdAt: at(ago(420)) }));
  await insert("course_categories", categories, (d) => prisma.courseCategory.createMany({ data: d }));
  const catId = (name: string) => categories.find((c) => c.name === name)!.id;

  // ---------------- Phòng ban ----------------
  const depts: Dept[] = DEPARTMENTS.map(([companyCode, code, name, parentCode, isActive]) => ({ id: newId(), companyCode, code, name, parentCode, isActive, managerId: null }));
  const dept = (companyCode: string, code: string) => depts.find((d) => d.companyCode === companyCode && d.code === code)!;
  const subtree = (d: Dept): Dept[] => [d, ...depts.filter((x) => x.companyCode === d.companyCode && x.parentCode === d.code).flatMap(subtree)];

  // ---------------- Người dùng ----------------
  const users: User[] = [];
  const mk = (u: Omit<User, "id" | "name" | "hiredAt" | "email"> & { name?: string; hiredDaysAgo?: number }) => {
    const name = u.name ?? fullName();
    usedNames.add(name);
    const user: User = { ...u, id: newId(), name, hiredAt: ago(u.hiredDaysAgo ?? rng.int(120, 2500)), email: `${u.code.toLowerCase()}@hungthinh.vn` };
    users.push(user);
    return user;
  };
  const L = (code: string, companyCode: string, deptCode: string | null, posCode: string | null, extra: Partial<User> & { name?: string; hiredDaysAgo?: number } = {}) =>
    mk({ code, role: "LEARNER", active: true, companyCode, deptCode, posCode, ...extra });

  // Quản trị
  mk({ code: "ADMIN", name: "Trần Quốc Bảo", role: "GROUP_ADMIN", active: true, companyCode: "TONG", deptCode: "BGD", posCode: "PGD", hiredDaysAgo: 3000 });
  mk({ code: "GA02", name: "Lê Thu Hà", role: "GROUP_ADMIN", active: true, companyCode: "TONG", deptCode: "NS", posCode: "TP", hiredDaysAgo: 2400 });
  const caCodes: Record<string, string> = {};
  for (const c of companies) {
    const code = `CA-${c.short}`;
    caCodes[c.code] = code;
    const dCode = c.code === "TONG" ? "NS-DT" : (DEPARTMENTS.find(([cc, dc]) => cc === c.code && dc === "HCNS")?.[1] ?? null);
    mk({ code, role: "COMPANY_ADMIN", active: true, companyCode: c.code, deptCode: dCode, posCode: "TP", name: c.code === "TONG" ? "Phạm Minh Đức" : c.code === "HTTM" ? "Hoàng Thị Lan" : undefined, hiredDaysAgo: rng.int(900, 2800) });
  }
  // Biên soạn
  mk({ code: "CE-TONG", name: "Ngô Thanh Tâm", role: "CONTENT_EDITOR", active: true, companyCode: "TONG", deptCode: "NS-DT", posCode: "NVHC", hiredDaysAgo: 1500 });
  mk({ code: "CE-TM", name: "Bùi Ngọc Ánh", role: "CONTENT_EDITOR", active: true, companyCode: "HTTM", deptCode: "MKT", posCode: "NVHC", hiredDaysAgo: 1100 });
  mk({ code: "CE-SX", name: "Đỗ Quang Huy", role: "CONTENT_EDITOR", active: true, companyCode: "HTSX", deptCode: "QC", posCode: "KTV", hiredDaysAgo: 900 });
  // Trưởng phòng (MANAGER) — làm trưởng phòng ban tương ứng
  const managers: [string, string, string, string | undefined][] = [
    ["MG-NS", "TONG", "NS", "Vũ Thị Hồng"],
    ["MG-TCKT", "TONG", "TCKT", undefined],
    ["MG-CNTT", "TONG", "CNTT", undefined],
    ["MG-KD", "HTTM", "KD", "Đặng Minh Khoa"],
    ["MG-KDMB", "HTTM", "KD-MB", "Phan Văn Hưng"],
    ["MG-CSKH", "HTTM", "CSKH", undefined],
    ["MG-KHO", "HTLOG", "KHO", "Lý Văn Kho"],
    ["MG-SX", "HTSX", "SX", "Hồ Đức Thắng"],
    ["MG-QC", "HTSX", "QC", undefined],
    ["MG-CN", "HTCN", "PTPM", undefined],
  ];
  for (const [code, cc, dc, name] of managers) {
    const m = mk({ code, name, role: "MANAGER", active: true, companyCode: cc, deptCode: dc, posCode: "TP", hiredDaysAgo: rng.int(1000, 3000) });
    dept(cc, dc).managerId = m.id;
  }
  // Học viên (học viên mẫu chính: TM-001 Nguyễn Văn An)
  L("TM-001", "HTTM", "KD-MB-HN", "NVKD", { name: "Nguyễn Văn An", hiredDaysAgo: 230 });
  L("TM-002", "HTTM", "KD-MB-HN", "NVKD", { name: "Trần Thị Bình", hiredDaysAgo: 210 });
  L("TM-003", "HTTM", "KD-MB", "TN", { hiredDaysAgo: 700 });
  for (let i = 4; i <= 6; i++) L(`TM-00${i}`, "HTTM", "KD-MB", "NVKD", { hiredDaysAgo: rng.int(60, 500) });
  for (let i = 7; i <= 9; i++) L(`TM-00${i}`, "HTTM", "KD-MN", "NVKD");
  L("TM-010", "HTTM", "MKT", "NVHC");
  L("TM-011", "HTTM", "KT", "KT");
  L("TM-012", "HTTM", "CSKH", "CSKH");
  L("TM-013", "HTTM", "CSKH", "CSKH");
  L("TM-014", "HTTM", "KD-MN", "NVKD", { active: false }); // đã nghỉ việc
  L("TM-015", "HTTM", "KD-MB-HN", "TTS", { hiredDaysAgo: 8 }); // nhân viên mới vào
  for (let i = 1; i <= 6; i++) L(`TONG-00${i}`, "TONG", ["NS-TD", "TCKT", "TCKT", "CNTT", "CNTT", "PC"][i - 1], ["NVHC", "KT", "KT", "KTV", "KTV", "NVHC"][i - 1]);
  for (let i = 1; i <= 8; i++) L(`LOG-00${i}`, "HTLOG", i <= 3 ? "KHO-HN" : i <= 6 ? "KHO-HCM" : "VT", i <= 6 ? "KHO" : "NVHC", i === 8 ? { lockedUntil: NOW + 10 * 60_000, failedLoginCount: 5 } : {});
  for (let i = 1; i <= 8; i++) L(`SX-00${i}`, "HTSX", i <= 4 ? "SX-1" : i <= 6 ? "SX-2" : "QC", i <= 6 ? "CN" : "KTV", i === 8 ? { active: false } : {});
  for (const [cc, short, d1, d2] of [["HTBL", "BL", "CH", "HCNS"], ["HTXD", "XD", "KTHT", "HCNS"], ["HTCN", "CN", "PTPM", "HTKT"], ["HTBDS", "BDS", "KD", "PL"], ["HTDV", "DV", "DV", "HCNS"], ["HTMT", "MT", "KD", "HCNS"]] as const) {
    L(`${short}-001`, cc, d1, cc === "HTCN" ? "KTV" : "NVKD");
    L(`${short}-002`, cc, d1, cc === "HTCN" ? "KTV" : "CSKH");
    L(`${short}-003`, cc, d2, "NVHC");
  }

  // Phòng ban (chưa có trưởng phòng) → người dùng → gán trưởng phòng (tham chiếu vòng)
  for (const level of [0, 1, 2]) {
    const rows = depts.filter((d) => {
      let lv = 0;
      let p = d.parentCode;
      while (p) {
        lv++;
        p = dept(d.companyCode, p).parentCode;
      }
      return lv === level;
    });
    await insert("departments", rows, (x) =>
      prisma.department.createMany({
        data: x.map((d) => ({ id: d.id, companyId: company(d.companyCode).id, parentId: d.parentCode ? dept(d.companyCode, d.parentCode).id : null, code: d.code, name: d.name, isActive: d.isActive, createdAt: at(ago(400)), updatedAt: at(ago(d.isActive ? 400 : 30)) })),
      }),
    );
  }
  await insert("users", users, (d) =>
    prisma.user.createMany({
      data: d.map((u) => ({
        id: u.id,
        employeeCode: u.code,
        passwordHash,
        mustChangePassword: false,
        fullName: u.name,
        email: u.email,
        phone: `09${String(rng.int(10_000_000, 99_999_999))}`,
        role: u.role,
        status: u.active ? ("ACTIVE" as const) : ("INACTIVE" as const),
        companyId: company(u.companyCode).id,
        departmentId: u.deptCode ? dept(u.companyCode, u.deptCode).id : null,
        positionId: posId(u.posCode),
        hireDate: dateOnly(u.hiredAt),
        lastLoginAt: u.active ? at(between(ago(14), NOW - HOUR)) : null,
        failedLoginCount: u.failedLoginCount ?? 0,
        lockedUntil: u.lockedUntil ? at(u.lockedUntil) : null,
        createdAt: at(Math.max(u.hiredAt, ago(410))),
        updatedAt: at(Math.max(u.hiredAt, ago(410))),
      })),
    }),
  );
  for (const d of depts.filter((x) => x.managerId)) await prisma.department.update({ where: { id: d.id }, data: { managerId: d.managerId } });
  const user = (code: string) => users.find((u) => u.code === code)!;
  const admin = user("ADMIN");
  const caOf = (companyCode: string) => user(caCodes[companyCode]);

  // ---------------- Khoá học, phiên bản, chương, bài, câu hỏi ----------------
  type LessonRow = { id: string; type: LessonType; title: string; duration: number | null; maxAttempts: number | null; passingScore: number; questionCount: number; archived: boolean };
  type QRow = { id: string; type: "SINGLE" | "MULTIPLE"; content: string; explanation: string | null; options: { id: string; text: string; isCorrect: boolean }[]; usable: boolean };
  type Course = CourseDef & { id: string; createdAt: number; currentVersion: number; pub: { id: string; no: number; type: VersionDef["type"]; at: number; dueInDays: number | null }[]; lessons: LessonRow[]; qs: QRow[] };
  const courses: Course[] = [];
  const sections: Prisma.CourseSectionCreateManyInput[] = [];
  const lessons: Prisma.LessonCreateManyInput[] = [];
  const questions: Prisma.QuestionCreateManyInput[] = [];
  const versions: Prisma.CourseVersionCreateManyInput[] = [];
  const editorOf = (owner: string) => (owner === "TONG" ? user("CE-TONG") : owner === "HTTM" ? user("CE-TM") : owner === "HTSX" ? user("CE-SX") : caOf(owner));

  for (const def of COURSES) {
    const createdAt = def.versions.length ? ago(def.versions[0].daysAgo + rng.int(5, 15)) : ago(rng.int(5, 20));
    const pub = def.versions.map((v, i) => ({ id: newId(), no: i + 1, type: v.type, at: ago(v.daysAgo) + rng.int(8, 11) * HOUR, dueInDays: v.dueInDays ?? null }));
    const c: Course = { ...def, id: newId(), createdAt, currentVersion: pub.length, pub, lessons: [], qs: [] };
    courses.push(c);
    def.versions.forEach((v, i) =>
      versions.push({
        id: pub[i].id, courseId: c.id, versionNo: i + 1, changeType: v.type, status: "PUBLISHED", changeSummary: v.summary ?? null, dueInDays: v.dueInDays ?? null,
        proposedById: v.type === "MAJOR" ? editorOf(def.owner).id : null, proposedAt: v.type === "MAJOR" ? at(pub[i].at - 2 * DAY) : null,
        publishedById: def.owner === "TONG" ? admin.id : caOf(def.owner).id, publishedAt: at(pub[i].at), createdAt: at(pub[i].at),
      }),
    );
    for (const p of def.proposals ?? []) {
      versions.push({
        id: newId(), courseId: c.id, versionNo: null, changeType: "MAJOR", status: p.status, changeSummary: p.summary, dueInDays: 30,
        proposedById: editorOf(def.owner).id, proposedAt: at(ago(p.daysAgo)), reviewNote: p.reviewNote ?? null, createdAt: at(ago(p.daysAgo)),
      });
    }

    // Chương 1: giới thiệu (video ngắn + tài liệu); mỗi chủ đề 1 chương; chương cuối: bài kiểm tra
    const sec = (title: string, i: number, archived = false) => {
      const id = newId();
      sections.push({ id, courseId: c.id, title, sortOrder: i, isArchived: archived, createdAt: at(createdAt) });
      return id;
    };
    const les = (sectionId: string, sortOrder: number, l: Partial<Prisma.LessonCreateManyInput> & { title: string; type: LessonType }, archived = false) => {
      const id = newId();
      lessons.push({ id, sectionId, sortOrder, isArchived: archived, createdAt: at(createdAt), updatedAt: at(createdAt), ...l });
      c.lessons.push({
        id, type: l.type, title: l.title, duration: l.durationSeconds ?? null, maxAttempts: l.maxAttempts ?? null,
        passingScore: l.passingScore ?? 0, questionCount: l.questionCount ?? 0, archived,
      });
    };
    const html = (t: Topic) => `<h2>${t.title}</h2><p>Nội dung khoá “${def.title}” — phần ${t.title.toLowerCase()}.</p><ul>${t.points.map((p) => `<li>${p}</li>`).join("")}</ul><p><b>Ghi nhớ:</b> áp dụng ngay trong công việc hằng ngày, hỏi trưởng phòng khi chưa rõ.</p>`;
    const s0 = sec("Giới thiệu khoá học", 0);
    les(s0, 0, { title: "Video giới thiệu", type: "VIDEO", videoProvider: "YOUTUBE", videoId: VIDEO_INTRO.id, videoStatus: "READY", durationSeconds: VIDEO_INTRO.duration, minWatchPercent: 90 });
    les(s0, 1, { title: "Mục tiêu và cách học", type: "DOCUMENT", content: `<h2>Mục tiêu khoá học</h2><p>${def.description}</p><p>Học lần lượt từng bài; bài tài liệu cần đọc tối thiểu 15 giây, video cần xem đủ 90%. Cuối khoá có bài kiểm tra.</p>` });
    def.topics.forEach((t, i) => {
      const s = sec(`Chương ${i + 1}: ${t.title}`, i + 1);
      les(s, 0, { title: t.title, type: "DOCUMENT", content: html(t) });
      if (t.video) les(s, 1, { title: `Video: ${t.title}`, type: "VIDEO", videoProvider: "YOUTUBE", videoId: VIDEO_LONG.id, videoStatus: "READY", durationSeconds: VIDEO_LONG.duration, minWatchPercent: 90 });
    });
    if (def.archivedExtra) {
      // Bài / chương đã ẩn khỏi học viên (khoá đã phát hành không xoá hẳn)
      const sa = sec("Chương cũ: Quy định 2024 (đã ẩn)", def.topics.length + 1, true);
      les(sa, 0, { title: "Quy định cũ 2024", type: "DOCUMENT", content: "<p>Nội dung đã thay thế.</p>" }, true);
    }
    const sq = sec("Kiểm tra cuối khoá", def.topics.length + (def.archivedExtra ? 2 : 1));
    les(sq, 0, {
      title: "Bài kiểm tra cuối khoá", type: "QUIZ", questionCount: 5, passingScore: def.quiz.passingScore, timeLimitMinutes: 15,
      maxAttempts: def.quiz.maxAttempts, showAnswers: def.quiz.showAnswers,
    });

    // Ngân hàng câu hỏi (≥ 10 câu / khoá): câu cuối bị tắt ở 1 số khoá, 1 câu “chờ duyệt” (AI tạo) ở khoá có nhiều phiên bản
    BANKS[def.bank].forEach((b, i) => {
      const id = newId();
      const correct = b.options.filter(([, ok]) => ok).length;
      const options = b.options.map(([text, isCorrect], k) => ({ id: "abcd"[k], text, isCorrect }));
      const isActive = !(i === 11 && rng.chance(0.5));
      const isApproved = !(i === 10 && c.pub.length > 1);
      questions.push({
        id, courseId: c.id, topic: b.topic, type: correct > 1 ? "MULTIPLE" : "SINGLE", content: b.content, options, explanation: b.explanation ?? (i % 3 === 0 ? "Xem lại nội dung chương liên quan trong khoá học." : null),
        isActive, isApproved, isAiCreated: !isApproved, createdAt: at(createdAt), updatedAt: at(createdAt),
      });
      c.qs.push({ id, type: correct > 1 ? "MULTIPLE" : "SINGLE", content: b.content, explanation: null, options, usable: isActive && isApproved });
    });
  }
  const course = (code: string) => courses.find((c) => c.code === code)!;
  await insert("courses", courses, (d) =>
    prisma.course.createMany({
      data: d.map((c) => ({
        id: c.id, ownerCompanyId: company(c.owner).id, categoryId: catId(c.category), code: c.code, title: c.title, description: c.description, status: c.status,
        currentVersion: c.currentVersion, allowSelfEnroll: !!c.selfEnroll, hasCertificate: !!c.cert, certificateValidMonths: c.cert?.months ?? null,
        createdAt: at(c.createdAt), updatedAt: at(c.pub.at(-1)?.at ?? c.createdAt),
      })),
    }),
  );
  await insert("course_versions", versions, (d) => prisma.courseVersion.createMany({ data: d }));
  await insert("course_sections", sections, (d) => prisma.courseSection.createMany({ data: d }));
  await insert("lessons", lessons, (d) => prisma.lesson.createMany({ data: d }));
  await insert("questions", questions, (d) => prisma.question.createMany({ data: d }));

  // ---------------- Lộ trình ----------------
  const paths = PATHS.map(([code, owner, title, status, courseCodes, description]) => ({ id: newId(), code, owner, title, status, courseCodes, description }));
  const path = (code: string) => paths.find((p) => p.code === code)!;
  await insert("learning_paths", paths, (d) =>
    prisma.learningPath.createMany({ data: d.map((p) => ({ id: p.id, ownerCompanyId: company(p.owner).id, code: p.code, title: p.title, description: p.description, status: p.status, createdAt: at(ago(250)), updatedAt: at(ago(p.status === "PUBLISHED" ? 240 : 20)) })) }),
  );
  await insert("learning_path_courses", paths.flatMap((p) => p.courseCodes.map((cc, i) => ({ learningPathId: p.id, courseId: course(cc).id, sortOrder: i }))), (d) =>
    prisma.learningPathCourse.createMany({ data: d }),
  );

  // ---------------- Quy tắc giao ----------------
  const rules = RULES.map((r) => ({ ...r, id: newId() }));
  await insert("assignment_rules", rules, (d) =>
    prisma.assignmentRule.createMany({
      data: d.map((r) => ({
        id: r.id, ownerCompanyId: company(r.owner).id, name: r.name, courseId: r.course ? course(r.course).id : null, learningPathId: r.path ? path(r.path).id : null,
        targetCompanyId: r.target ? company(r.target).id : null, departmentId: r.dept ? dept(r.target ?? r.owner, r.dept).id : null, includeSubDepartments: true,
        positionId: posId(r.pos ?? null), dueInDays: r.due, isActive: r.active, createdAt: at(ago(r.daysAgo)), updatedAt: at(ago(r.active ? r.daysAgo : 10)),
      })),
    }),
  );
  const ruleMatches = (r: (typeof rules)[number], u: User) =>
    (!r.target || r.target === u.companyCode) &&
    (!r.dept || (u.deptCode !== null && u.companyCode === (r.target ?? r.owner) && subtree(dept(r.target ?? r.owner, r.dept)).some((d) => d.code === u.deptCode))) &&
    (!r.pos || r.pos === u.posCode);

  // ---------------- Lượt học + tiến độ + bài làm + chứng nhận + đánh giá + thông báo ----------------
  const enrollments: Prisma.EnrollmentCreateManyInput[] = [];
  const progress: Prisma.LessonProgressCreateManyInput[] = [];
  const attempts: Prisma.QuizAttemptCreateManyInput[] = [];
  const certificates: Prisma.CertificateCreateManyInput[] = [];
  const reviews: Prisma.CourseReviewCreateManyInput[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  const attemptNo = new Map<string, number>();
  const certCodes = new Set<string>();
  const CERT_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

  const notify = (u: User, type: string, title: string, t: number, link: string | null, dedupeKey: string | null = null, read?: boolean) => {
    const isRead = read ?? (NOW - t > 3 * DAY ? rng.chance(0.75) : rng.chance(0.3));
    notifications.push({ id: newId(), userId: u.id, type, title, link, dedupeKey, readAt: isRead ? at(clampNow(t + rng.int(1, 48) * HOUR)) : null, createdAt: at(clampNow(t)) });
  };
  const log = (actor: User | null, action: string, entityType: string, entityId: string | null, t: number, metadata: Prisma.InputJsonValue | null = null, companyCode?: string) =>
    audit.push({ id: newId(), actorId: actor?.id ?? null, companyId: actor ? company(companyCode ?? actor.companyCode).id : companyCode ? company(companyCode).id : null, action, entityType, entityId, metadata: metadata ?? undefined, createdAt: at(clampNow(t)) });

  const versionAt = (c: Course, t: number) => c.pub.reduce((v, x) => (x.at <= t ? x.no : v), 1);
  const visibleLessons = (c: Course) => c.lessons.filter((l) => !l.archived);

  function quiz(c: Course, l: LessonRow, u: User, t: number, pass: boolean, n: number = pass ? rng.weighted([[1, 0.65], [2, 0.35]] as const) : 1) {
    const version = versionAt(c, t);
    const key = `${l.id}|${u.id}|${version}`;
    const usable = c.qs.filter((x) => x.usable);
    for (let k = 0; k < n; k++) {
      const no = (attemptNo.get(key) ?? 0) + 1;
      if (l.maxAttempts !== null && no > l.maxAttempts) return;
      attemptNo.set(key, no);
      const passed = pass && k === n - 1;
      const picked = rng.sample(usable, l.questionCount);
      const need = Math.ceil((l.passingScore / 100) * l.questionCount);
      const correctN = passed ? rng.int(need, l.questionCount) : rng.int(Math.max(0, need - 3), need - 1);
      const started = t - (n - k) * rng.int(30, 180) * 60_000;
      const answers = picked.map((x, i) => ({
        questionId: x.id, type: x.type, content: x.content, imageUrl: null, explanation: x.explanation, options: x.options,
        selected: i < correctN ? x.options.filter((o) => o.isCorrect).map((o) => o.id) : [x.options.find((o) => !o.isCorrect)!.id],
      }));
      const score = Math.round((correctN / l.questionCount) * 100);
      attempts.push({ id: newId(), lessonId: l.id, userId: u.id, courseVersion: version, attemptNo: no, answers, score, passed: score >= l.passingScore, startedAt: at(started), submittedAt: at(started + rng.int(5, 14) * 60_000) });
    }
  }

  /** k bài đầu đã xong trong [from, to]; bài thứ k đang học dở nếu inProgress. */
  function lessonRows(c: Course, u: User, k: number, from: number, to: number, inProgress: boolean, quizzes = true) {
    const ls = visibleLessons(c);
    ls.forEach((l, i) => {
      if (i < k) {
        const t = from + ((to - from) * (i + 1)) / Math.max(k, 1);
        if (quizzes && l.type === "QUIZ") quiz(c, l, u, t, true);
        progress.push({ id: newId(), userId: u.id, lessonId: l.id, isCompleted: true, completedAt: at(t), maxWatchedSeconds: l.duration ?? 0, lastPositionSeconds: l.duration ?? 0, updatedAt: at(t) });
      } else if (i === k && inProgress) {
        const t = clampNow(between(to, to + 3 * DAY));
        if (quizzes && l.type === "QUIZ") quiz(c, l, u, t, false);
        const watched = l.duration ? Math.floor(l.duration * rng.int(20, 70) / 100) : 0;
        progress.push({ id: newId(), userId: u.id, lessonId: l.id, isCompleted: false, maxWatchedSeconds: watched, lastPositionSeconds: watched, updatedAt: at(t) });
      }
    });
  }

  const certCode = (t: number) => {
    for (;;) {
      let s = "";
      for (let k = 0; k < 6; k++) s += CERT_CHARS[rng.int(0, CERT_CHARS.length - 1)];
      const code = `CERT-${new Date(t).getUTCFullYear()}-${s}`;
      if (!certCodes.has(code)) return certCodes.add(code), code;
    }
  };
  function issue(c: Course, u: User, t: number, revoked = false) {
    if (!c.cert) return null;
    const id = newId();
    const owner = company(u.companyCode);
    const expiresAt = c.cert.months ? addMonths(t, c.cert.months) : null;
    const code = certCode(t);
    certificates.push({
      id, code, userId: u.id, courseId: c.id, courseVersion: versionAt(c, t), recipientName: u.name, courseTitle: c.title, issuedAt: at(t),
      expiresAt: expiresAt ? at(expiresAt) : null, revokedAt: revoked ? at(clampNow(t + 20 * DAY)) : null,
      templateSnapshot: { companyName: owner.name, logoKey: null, signerName: owner.code === "HTTM" ? "Trần Thị Mai" : "Nguyễn Văn Thịnh", signerTitle: owner.code === "HTTM" ? "Giám đốc Nhân sự" : "Tổng Giám đốc", signatureKey: null },
    });
    notify(u, "CERTIFICATE_ISSUED", `Bạn nhận chứng nhận khoá “${c.title}”`, t, "/certificates", `cert_issued:${id}`);
    if (revoked) log(admin, "CERTIFICATE_REVOKED", "Certificate", id, t + 20 * DAY, { code, learnerName: u.name, reason: "Phát hiện làm bài hộ" }, u.companyCode);
    return { id, expiresAt };
  }

  type Plan = "NOT_STARTED" | "IN_PROGRESS" | "OVERDUE_NS" | "OVERDUE_IP" | "COMPLETED" | "RELEARN" | "PENDING_MINOR" | "EXPIRING" | "EXPIRED" | "CANCELLED" | "LOCKED";
  const REVIEW_COMMENTS = [
    "Nội dung dễ hiểu, áp dụng được ngay.", "Video ngắn gọn, ví dụ thực tế.", "Bài kiểm tra hơi khó nhưng hữu ích.",
    "Nên thêm tình huống thực tế hơn.", "Rất cần thiết cho nhân viên mới.", null, null,
  ];

  /** 1 lượt học từ lúc giao tới hiện tại theo kế hoạch `plan`. Trả về trạng thái cuối. */
  function enroll(u: User, c: Course, source: EnrollmentSource, plan: Plan, opts: { ruleId?: string; pathId?: string; dueDays?: number | null; assignedBy?: User | null } = {}): EnrollmentStatus {
    const id = newId();
    const ls = visibleLessons(c);
    const n = ls.length;
    const dueDays = source === "SELF" ? null : (opts.dueDays ?? 30);
    const firstPub = c.pub[0].at;
    const earliest = Math.max(firstPub + HOUR, u.hiredAt);
    if (!dueDays && (plan === "OVERDUE_NS" || plan === "OVERDUE_IP")) plan = plan === "OVERDUE_NS" ? "NOT_STARTED" : "IN_PROGRESS";
    const lastMajor = c.pub.filter((v) => v.type === "MAJOR").at(-1);
    const lastMinor = c.pub.filter((v) => v.type === "MINOR").at(-1);
    if (plan === "RELEARN" && !lastMajor) plan = "COMPLETED";
    if (plan === "PENDING_MINOR" && (!lastMinor || (lastMajor && lastMajor.at > lastMinor.at))) plan = "COMPLETED";
    if ((plan === "EXPIRING" || plan === "EXPIRED") && !c.cert?.months) plan = "COMPLETED";

    let created = NOW;
    let status: EnrollmentStatus = "NOT_STARTED";
    let startedAt: number | null = null;
    let completedAt: number | null = null;
    let completedVersion: number | null = null;
    let ackVersion: number | null = null;
    let ackAt: number | null = null;
    let due: number | null = null;
    let k = 0;


    if (plan === "COMPLETED" || plan === "PENDING_MINOR" || plan === "RELEARN" || plan === "EXPIRING" || plan === "EXPIRED") {
      // Chọn thời điểm hoàn thành theo kế hoạch
      const lastAt = c.pub.at(-1)!.at;
      let t: number;
      if (plan === "RELEARN") t = between(Math.max(earliest + 3 * DAY, lastMajor!.at - 90 * DAY), lastMajor!.at - DAY);
      else if (plan === "PENDING_MINOR") t = between(Math.max(earliest + 3 * DAY, lastMinor!.at - 60 * DAY), lastMinor!.at - DAY);
      else if (plan === "EXPIRING") t = addMonths(NOW, -c.cert!.months!) + rng.int(5, 25) * DAY;
      else if (plan === "EXPIRED") t = addMonths(NOW, -c.cert!.months!) - rng.int(5, 40) * DAY;
      else t = between(Math.max(earliest + 3 * DAY, lastAt + DAY), NOW - DAY);
      t = Math.max(t, earliest + 2 * DAY);
      created = Math.max(earliest, t - rng.int(3, Math.max(4, (dueDays ?? 30) - 2)) * DAY);
      due = dueDays ? dueOf(created, dueDays) : null;
      // Lần hoàn thành tại t: đủ bài, bài làm đạt, chứng nhận
      t = clampNow(t);
      const firstStart = clampNow(Math.max(created + HOUR, t - rng.int(2, 15) * DAY));
      lessonRows(c, u, n, firstStart, t, false);
      startedAt = firstStart;
      completedAt = t;
      completedVersion = versionAt(c, t);
      ackVersion = completedVersion;
      ackAt = t;
      const cert = issue(c, u, t, rng.chance(0.03));
      status = "COMPLETED";
      const doneAt = t;

      if (plan === "RELEARN" && lastMajor && doneAt < lastMajor.at) {
        // Bản MAJOR sau khi học xong → học lại (giữ completedVersion / acknowledgedVersion, chứng nhận cũ giữ nguyên)
        notify(u, "VERSION_MAJOR", `Khoá “${c.title}” có thay đổi lớn — vui lòng học lại`, lastMajor.at, `/my-courses/${c.id}`, `version_major:${c.id}:v${lastMajor.no}`);
        due = dueOf(lastMajor.at, lastMajor.dueInDays ?? 30);
        progress.splice(progress.length - n, n); // bỏ tiến độ lần trước (đã đặt lại)
        completedAt = null;
        if (rng.chance(0.6) || u.code === "TM-001") {
          status = "IN_PROGRESS";
          startedAt = clampNow(lastMajor.at + rng.int(1, 5) * DAY);
          k = rng.int(1, n - 1);
          lessonRows(c, u, k, startedAt, clampNow(startedAt + 3 * DAY), true);
        } else {
          status = "NOT_STARTED";
          startedAt = null;
        }
      } else if (plan === "EXPIRED" && cert?.expiresAt && cert.expiresAt < NOW) {
        // Chứng nhận hết hạn → tác vụ hằng ngày đặt lại khoá để học lại
        notify(u, "CERTIFICATE_EXPIRING", `Chứng nhận khoá “${c.title}” sắp hết hạn`, cert.expiresAt - 30 * DAY, "/certificates", `cert_expiring:${cert.id}`);
        progress.splice(progress.length - n, n);
        status = "NOT_STARTED";
        completedAt = null;
        startedAt = null;
        due = dueOf(cert.expiresAt, 30);
      } else if (plan === "EXPIRING" && cert?.expiresAt) {
        notify(u, "CERTIFICATE_EXPIRING", `Chứng nhận khoá “${c.title}” sắp hết hạn`, Math.min(NOW - HOUR, cert.expiresAt - 30 * DAY), "/certificates", `cert_expiring:${cert.id}`, false);
      } else if (plan === "PENDING_MINOR" && lastMinor) {
        notify(u, "VERSION_MINOR", `Khoá “${c.title}” có cập nhật — đọc và xác nhận`, lastMinor.at, `/my-courses/${c.id}/updates`, `version_minor:${c.id}:v${lastMinor.no}`, false);
      } else if (lastMinor && doneAt < lastMinor.at) {
        // Hoàn thành trước bản MINOR nhưng đã xác nhận
        ackVersion = c.currentVersion;
        ackAt = clampNow(lastMinor.at + rng.int(1, 6) * DAY);
      }
      // Đánh giá khoá (người từng hoàn thành)
      if (rng.chance(0.55) || u.code === "TM-001") {
        const tr = clampNow(doneAt + rng.int(1, 30) * HOUR);
        reviews.push({ id: newId(), courseId: c.id, userId: u.id, rating: rng.weighted([[5, 0.45], [4, 0.33], [3, 0.12], [2, 0.06], [1, 0.04]] as const), comment: rng.pick(REVIEW_COMMENTS), createdAt: at(tr), updatedAt: at(tr) });
      }
    } else if (plan === "CANCELLED") {
      created = between(Math.max(earliest, ago(200)), ago(20));
      due = dueDays ? dueOf(created, dueDays) : null;
      status = "CANCELLED";
      if (rng.chance(0.5)) {
        startedAt = clampNow(created + DAY);
        k = rng.int(1, Math.max(1, n - 2));
        lessonRows(c, u, k, startedAt, startedAt + 2 * DAY, false);
      }
      log(opts.assignedBy ?? caOf(u.companyCode), "ENROLLMENT_CANCELLED", "Enrollment", id, clampNow(created + rng.int(3, 15) * DAY), { learnerName: u.name, courseCode: c.code, reason: "Chuyển công việc, không còn phù hợp" }, u.companyCode);
    } else {
      const overdue = plan === "OVERDUE_NS" || plan === "OVERDUE_IP";
      if (overdue) created = Math.max(earliest, ago(dueDays! + rng.int(2, 25)));
      else if (plan === "LOCKED") created = Math.max(earliest, ago(rng.int(5, Math.max(6, (dueDays ?? 30) - 5))));
      else created = Math.max(earliest, ago(rng.int(1, Math.max(2, Math.floor((dueDays ?? 40) * 0.7)))));
      due = dueDays ? dueOf(created, dueDays) : null;
      if (plan === "IN_PROGRESS" || plan === "OVERDUE_IP") {
        status = "IN_PROGRESS";
        startedAt = clampNow(created + rng.int(2, 30) * HOUR);
        k = rng.int(1, n - 1);
        lessonRows(c, u, k, startedAt, clampNow(startedAt + rng.int(1, 5) * DAY), true);
      } else status = "NOT_STARTED";
    }

    const pct = status === "COMPLETED" ? 100 : Math.round((k / n) * 100);
    enrollments.push({
      id, userId: u.id, courseId: c.id, source, assignedById: source === "ASSIGNED" ? (opts.assignedBy ?? caOf(u.companyCode)).id : null,
      assignmentRuleId: opts.ruleId ?? null, learningPathId: opts.pathId ?? null, status, progressPercent: pct,
      dueDate: due ? at(due) : null, startedAt: startedAt ? at(startedAt) : null, completedAt: status === "COMPLETED" && completedAt ? at(completedAt) : null,
      completedVersion, acknowledgedVersion: ackVersion, acknowledgedAt: ackAt ? at(ackAt) : null, createdAt: at(created), updatedAt: at(clampNow(Math.max(created, startedAt ?? 0, completedAt ?? 0, ackAt ?? 0))),
    });

    // Thông báo vòng đời
    if (source !== "SELF") notify(u, "COURSE_ASSIGNED", opts.pathId ? `Bạn được giao khoá “${c.title}” trong lộ trình` : `Bạn được giao khoá học “${c.title}”`, created, `/my-courses/${c.id}`, `assigned:${id}`);
    if (due && (status === "NOT_STARTED" || status === "IN_PROGRESS")) {
      const dueDay = vnIsoDate(at(due));
      if (due - 3 * DAY < NOW) notify(u, "DUE_SOON", `Khoá “${c.title}” sắp đến hạn (${dueDay.split("-").reverse().join("/")})`, Math.max(created, due - 3 * DAY), `/my-courses/${c.id}`, `due_soon:${id}:${dueDay}`);
      if (due < NOW) notify(u, "OVERDUE", `Khoá “${c.title}” đã quá hạn ${Math.max(1, Math.floor((NOW - due) / DAY))} ngày`, Math.min(NOW - HOUR, due + DAY), `/my-courses/${c.id}`, `overdue:${id}:${dueDay}:w0`, false);
    }
    return status;
  }

  /** Kế hoạch ngẫu nhiên có trọng số; ưu tiên kế hoạch cố định cho người dùng mẫu. */
  const FORCED: Record<string, Record<string, Plan>> = {
    "TM-001": { "VH-01": "COMPLETED", "TM-SP-01": "IN_PROGRESS", "AT-01": "RELEARN", "NQ-01": "PENDING_MINOR", "TM-BH-01": "LOCKED", "TM-QT-01": "LOCKED" },
    "TM-002": { "VH-01": "COMPLETED", "TM-SP-01": "COMPLETED", "TM-BH-01": "COMPLETED", "TM-QT-01": "PENDING_MINOR", "NQ-01": "OVERDUE_NS", "AT-01": "OVERDUE_IP" },
    "TM-015": { "VH-01": "NOT_STARTED", "AT-01": "NOT_STARTED", "NQ-01": "NOT_STARTED" },
    "SX-001": { "AT-02": "EXPIRING" },
    "SX-002": { "AT-02": "EXPIRED" },
    "SX-003": { "SX-AT-01": "EXPIRING" },
  };
  const randomPlan = (c: Course): Plan => {
    const p = rng.weighted([["COMPLETED", 0.42], ["IN_PROGRESS", 0.2], ["NOT_STARTED", 0.16], ["OVERDUE_NS", 0.07], ["OVERDUE_IP", 0.08], ["CANCELLED", 0.04], ["EXPIRING", 0.03]] as const) as Plan;
    if (p === "COMPLETED") {
      if (c.pub.some((v) => v.type === "MAJOR") && rng.chance(0.35)) return "RELEARN";
      if (c.pub.some((v) => v.type === "MINOR") && rng.chance(0.4)) return "PENDING_MINOR";
      if (c.cert?.months && rng.chance(0.12)) return "EXPIRED";
    }
    return p;
  };

  const enrolled = new Map<string, Set<string>>();
  const has = (u: User, c: Course) => enrolled.get(u.id)?.has(c.id) ?? false;
  const mark = (u: User, c: Course) => enrolled.set(u.id, new Set([...(enrolled.get(u.id) ?? []), c.id]));
  const learners = users.filter((u) => u.role !== "GROUP_ADMIN");

  // 1) Lộ trình (quy tắc gắn lộ trình): khoá sau chỉ mở khi khoá trước xong
  for (const r of rules.filter((x) => x.path && x.active)) {
    const p = path(r.path!);
    for (const u of learners.filter((x) => ruleMatches(r, x))) {
      let blocked = false;
      p.courseCodes.forEach((cc, i) => {
        const c = course(cc);
        if (has(u, c)) return;
        mark(u, c);
        const forced = FORCED[u.code]?.[cc];
        const plan: Plan = blocked ? "LOCKED" : (forced && forced !== "LOCKED" ? forced : u.active ? randomPlan(c) : "COMPLETED");
        const st = enroll(u, c, "RULE", plan === "LOCKED" ? "NOT_STARTED" : plan, { ruleId: r.id, pathId: p.id, dueDays: r.due });
        if (st === "COMPLETED") {
          const next = p.courseCodes[i + 1];
          const t = clampNow(new Date(enrollments.at(-1)!.completedAt as Date).getTime() + 60_000);
          if (next) notify(u, "PATH_NEXT_UNLOCKED", `Đã mở khoá học tiếp theo “${course(next).title}” trong lộ trình “${p.title}”`, t, `/my-courses/${course(next).id}`, `path_next:${p.id}:${course(next).id}`);
          else notify(u, "PATH_COMPLETED", `Chúc mừng! Bạn đã hoàn thành lộ trình “${p.title}”`, t, `/learning-paths/${p.id}`, `path_done:${p.id}`);
        } else blocked = true;
      });
    }
  }
  // 2) Quy tắc gắn khoá học (đang bật)
  for (const r of rules.filter((x) => x.course && x.active)) {
    const c = course(r.course!);
    for (const u of learners.filter((x) => ruleMatches(r, x))) {
      if (has(u, c)) continue;
      mark(u, c);
      const forced = FORCED[u.code]?.[c.code];
      enroll(u, c, "RULE", forced ?? (u.active ? randomPlan(c) : rng.pick(["COMPLETED", "CANCELLED"] as Plan[])), { ruleId: r.id, dueDays: r.due });
    }
  }
  // 3) Giao thủ công
  const manual: [string, string, Plan | null, string][] = [
    ["TM-001", "AT-02", "OVERDUE_NS", "CA-TM"],
    ["TM-001", "IT-01", "IN_PROGRESS", "ADMIN"],
    ["TM-003", "QL-01", null, "CA-TM"],
    ["TM-011", "TC-01", null, "CA-TM"],
    ["TM-012", "KN-01", null, "CA-TM"],
    ["TM-013", "KN-01", "CANCELLED", "CA-TM"],
    ["LOG-001", "AT-02", null, "CA-LOG"],
    ["LOG-002", "AT-02", null, "CA-LOG"],
    ["LOG-004", "IT-01", null, "ADMIN"],
    ["CN-001", "IT-01", null, "CA-CN"],
    ["CN-002", "IT-01", null, "CA-CN"],
    ["BL-001", "KN-01", null, "CA-BL"],
    ["BL-002", "AT-02", null, "CA-BL"],
    ["XD-001", "AT-02", null, "CA-XD"],
    ["BDS-001", "PL-01", null, "CA-BDS"],
    ["DV-001", "KN-01", null, "CA-DV"],
    ["TONG-001", "KN-01", null, "CA-TONG"],
    ["TONG-006", "PL-01", "COMPLETED", "CA-TONG"],
    ["MG-NS", "PL-01", null, "ADMIN"],
    ["MG-KD", "PL-01", null, "ADMIN"],
  ];
  for (const [uc, cc, plan, by] of manual) {
    const u = user(uc), c = course(cc);
    if (has(u, c)) continue;
    mark(u, c);
    enroll(u, c, "ASSIGNED", plan ?? randomPlan(c), { dueDays: rng.pick([14, 21, 30, 45]), assignedBy: user(by) });
  }
  // Khoá đã lưu trữ: lịch sử học cũ của nhân viên công ty tổng
  for (const u of learners.filter((x) => x.companyCode === "TONG").slice(0, 6)) {
    const c = course("HN-2025");
    mark(u, c);
    enroll(u, c, "ASSIGNED", "COMPLETED", { dueDays: 30, assignedBy: user("CA-TONG") });
  }
  // 4) Tự đăng ký từ thư viện
  const selfCourses = courses.filter((c) => c.selfEnroll && c.status === "PUBLISHED");
  for (const u of learners.filter((x) => x.active)) {
    for (const c of selfCourses) {
      if (has(u, c) || (c.owner !== "TONG" && c.owner !== u.companyCode)) continue;
      const forcedSelf = u.code === "TM-001" ? (c.code === "KN-01" ? "IN_PROGRESS" : c.code === "KN-02" ? "COMPLETED" : null) : null;
      if (!forcedSelf && !rng.chance(0.22)) continue;
      mark(u, c);
      enroll(u, c, "SELF", forcedSelf ?? rng.weighted([["COMPLETED", 0.5], ["IN_PROGRESS", 0.35], ["NOT_STARTED", 0.15]] as const));
    }
  }

  // Bài làm bỏ dở quá giờ (tác vụ hằng ngày sẽ chấm) + 1 người dùng hết lượt, được cấp thêm 1 lượt
  const inProg = enrollments.filter((e) => e.status === "IN_PROGRESS" && e.userId !== user("TM-001").id);
  for (const e of inProg.slice(0, 3)) {
    const c = courses.find((x) => x.id === e.courseId)!;
    const l = visibleLessons(c).find((x) => x.type === "QUIZ")!;
    const u = users.find((x) => x.id === e.userId)!;
    const key = `${l.id}|${u.id}|${c.currentVersion}`;
    const no = (attemptNo.get(key) ?? 0) + 1;
    if (l.maxAttempts !== null && no > l.maxAttempts) continue;
    attemptNo.set(key, no);
    const picked = rng.sample(c.qs.filter((x) => x.usable), l.questionCount);
    attempts.push({ id: newId(), lessonId: l.id, userId: u.id, courseVersion: c.currentVersion, attemptNo: no, answers: picked.map((x) => ({ questionId: x.id, type: x.type, content: x.content, imageUrl: null, explanation: x.explanation, options: x.options, selected: [] })), startedAt: at(NOW - rng.int(3, 20) * HOUR) });
  }
  {
    const u = user("TM-004");
    const c = course("TM-BH-01");
    const l = visibleLessons(c).find((x) => x.type === "QUIZ")!;
    const e = enrollments.find((x) => x.userId === u.id && x.courseId === c.id);
    if (e && e.status !== "COMPLETED" && e.status !== "CANCELLED") {
      // Trượt đủ 3 lượt → Admin công ty cấp thêm 1 lượt
      const key = `${l.id}|${u.id}|${c.currentVersion}`;
      const used = attemptNo.get(key) ?? 0;
      if (used < 3) quiz(c, l, u, ago(4), false, 3 - used);
      const p = progress.find((x) => x.userId === u.id && x.lessonId === l.id);
      if (p) p.bonusAttempts = 1;
      else progress.push({ id: newId(), userId: u.id, lessonId: l.id, isCompleted: false, bonusAttempts: 1, updatedAt: at(ago(3)) });
      notify(u, "QUIZ_ATTEMPTS_GRANTED", `Bạn được cấp thêm 1 lượt làm “Bài kiểm tra cuối khoá” — khoá “${c.title}”`, ago(3), `/my-courses/${c.id}`, null, false);
      log(caOf("HTTM"), "QUIZ_ATTEMPTS_GRANTED", "Enrollment", e.id!, ago(3), { learnerName: u.name, courseCode: c.code, lessonTitle: l.title, count: 1 });
    }
  }

  // Thông báo cho quản trị / biên soạn / trưởng phòng
  const it01 = course("IT-01");
  for (const u of [admin, user("GA02"), user("CA-TONG")]) notify(u, "VERSION_PROPOSED", `Ngô Thanh Tâm đề xuất cập nhật lớn khoá “${it01.title}” — chờ duyệt`, ago(3), `/content/courses/${it01.id}?tab=versions`, null, false);
  notify(user("CE-TONG"), "VERSION_REJECTED", `Đề xuất cập nhật khoá “${it01.title}” bị từ chối: nội dung chưa đủ`, ago(58), `/content/courses/${it01.id}?tab=versions`);
  // Trưởng phòng nhắc nhân viên quá hạn
  const reminders: [string, string[]][] = [["MG-KD", ["TM-002", "TM-004", "TM-007"]], ["MG-KDMB", ["TM-001", "TM-005"]], ["MG-KHO", ["LOG-001", "LOG-003"]], ["MG-SX", ["SX-001", "SX-004"]]];
  for (const [mc, targets] of reminders) {
    const m = user(mc);
    for (const tc of targets) {
      const t = ago(rng.int(1, 6));
      const target = user(tc);
      const open = enrollments.find((e) => e.userId === target.id && (e.status === "IN_PROGRESS" || e.status === "NOT_STARTED"));
      const c = open ? courses.find((x) => x.id === open.courseId)! : null;
      notify(target, "REMINDER", c ? `${m.name} nhắc bạn hoàn thành khoá “${c.title}”` : `${m.name} nhắc bạn hoàn thành các khoá được giao`, t, c ? `/my-courses/${c.id}` : "/my-courses", null, false);
      log(m, "TEAM_REMINDER_SENT", "User", target.id, t, { mode: "all", users: 1, notifications: 1, message: "Em sắp xếp hoàn thành trong tuần này nhé." });
    }
  }

  // ---------------- Nhật ký thao tác ----------------
  for (const c of companies.filter((x) => x.code !== "TONG")) log(admin, "COMPANY_CREATED", "Company", c.id, ago(415), { code: c.code, name: c.name }, "TONG");
  log(admin, "COMPANY_SUSPENDED", "Company", company("HTMT").id, ago(15), { code: "HTMT", activeUsers: users.filter((u) => u.companyCode === "HTMT").length }, "TONG");
  for (const c of companies.filter((x) => x.code !== "TONG")) log(admin, "COMPANY_ADMIN_CREATED", "User", user(caCodes[c.code]).id, ago(414), { employeeCode: caCodes[c.code], fullName: user(caCodes[c.code]).name }, c.code);
  for (const d of depts) log(caOf(d.companyCode), "DEPARTMENT_CREATED", "Department", d.id, ago(400) + rng.int(1, 20) * HOUR, { code: d.code, name: d.name });
  for (const d of depts.filter((x) => x.managerId)) log(caOf(d.companyCode), "DEPARTMENT_MANAGER_ASSIGNED", "Department", d.id, ago(390), { departmentCode: d.code, employeeCode: users.find((u) => u.id === d.managerId)!.code });
  log(caOf("HTTM"), "DEPARTMENT_TOGGLED", "Department", dept("HTTM", "DA").id, ago(30), { isActive: false });
  for (const p of positions) log(admin, "POSITION_CREATED", "Position", p.id, ago(418), { code: p.code, name: p.name }, "TONG");
  for (const c of categories) log(admin, "CATEGORY_CREATED", "CourseCategory", c.id, ago(417), { name: c.name }, "TONG");
  for (const u of users.filter((x) => x.role !== "GROUP_ADMIN" && !x.code.startsWith("CA-"))) log(caOf(u.companyCode), "USER_CREATED", "User", u.id, Math.max(u.hiredAt, ago(405)), { employeeCode: u.code, fullName: u.name, role: u.role, companyCode: u.companyCode, departmentCode: u.deptCode });
  log(caOf("HTLOG"), "USERS_IMPORTED", "User", null, ago(260), { companyCode: "HTLOG", created: 8, updated: 0, fileName: "nhan-vien-kho.xlsx" });
  log(caOf("HTTM"), "USER_LOCKED", "User", user("TM-014").id, ago(45), { reason: "Nghỉ việc" });
  log(caOf("HTSX"), "USER_LOCKED", "User", user("SX-008").id, ago(20), { reason: "Nghỉ việc" });
  log(caOf("HTTM"), "USER_PASSWORD_RESET", "User", user("TM-006").id, ago(9));
  log(caOf("HTTM"), "USER_ROLE_CHANGED", "User", user("MG-KDMB").id, ago(180), { from: "LEARNER", to: "MANAGER" });
  log(admin, "USER_TRANSFERRED", "User", user("TONG-004").id, ago(120), { fromCompany: "HTCN", toCompany: "TONG" }, "TONG");
  for (const c of courses) {
    const by = editorOf(c.owner);
    log(by, "COURSE_CREATED", "Course", c.id, c.createdAt, { code: c.code, title: c.title }, c.owner);
    if (c.pub[0]) log(c.owner === "TONG" ? admin : caOf(c.owner), "COURSE_PUBLISHED", "Course", c.id, c.pub[0].at, { code: c.code, versionNo: 1, changeType: "INITIAL" }, c.owner);
    for (const v of c.pub.slice(1)) log(c.owner === "TONG" ? admin : caOf(c.owner), "COURSE_VERSION_PUBLISHED", "Course", c.id, v.at, { code: c.code, versionNo: v.no, changeType: v.type, affected: rng.int(5, 30), fromProposal: v.type === "MAJOR" }, c.owner);
    if (c.pub.length) log(by, "QUESTIONS_IMPORTED", "Course", c.id, c.createdAt + DAY, { courseCode: c.code, count: 12, fileName: `cau-hoi-${c.code.toLowerCase()}.xlsx` }, c.owner);
    if (c.status === "ARCHIVED") log(admin, "COURSE_ARCHIVED", "Course", c.id, ago(60), null, c.owner);
  }
  log(user("CE-TONG"), "COURSE_VERSION_PROPOSED", "Course", it01.id, ago(60), { code: it01.code, dueInDays: 30 });
  log(admin, "COURSE_VERSION_REJECTED", "Course", it01.id, ago(58), { code: it01.code, reason: "Nội dung chưa đủ, cần bổ sung quy định BYOD." });
  log(user("CE-TONG"), "COURSE_VERSION_PROPOSED", "Course", it01.id, ago(3), { code: it01.code, dueInDays: 30 });
  {
    const at01 = course("AT-01");
    const changed = at01.lessons[2];
    const hidden = at01.lessons.find((l) => l.archived)!;
    log(user("CE-TONG"), "LESSON_UPDATED", "Lesson", changed.id, ago(27), { lessonTitle: changed.title, courseId: at01.id, courseCode: at01.code });
    log(user("CE-TONG"), "LESSON_ARCHIVED", "Lesson", hidden.id, ago(26), { lessonTitle: hidden.title, courseId: at01.id, courseCode: at01.code });
  }
  for (const p of paths) {
    log(p.owner === "TONG" ? admin : caOf(p.owner), "PATH_CREATED", "LearningPath", p.id, ago(250), { code: p.code, title: p.title, courseCount: p.courseCodes.length }, p.owner);
    if (p.status !== "DRAFT") log(p.owner === "TONG" ? admin : caOf(p.owner), "PATH_PUBLISHED", "LearningPath", p.id, ago(240), { code: p.code, title: p.title, courseCount: p.courseCodes.length }, p.owner);
    if (p.status === "ARCHIVED") log(admin, "PATH_ARCHIVED", "LearningPath", p.id, ago(20), { code: p.code, title: p.title }, p.owner);
  }
  for (const r of rules) {
    log(r.owner === "TONG" ? admin : caOf(r.owner), "ASSIGNMENT_RULE_CREATED", "AssignmentRule", r.id, ago(r.daysAgo), { ruleName: r.name }, r.owner);
    if (!r.active) log(r.owner === "TONG" ? admin : caOf(r.owner), "ASSIGNMENT_RULE_DISABLED", "AssignmentRule", r.id, ago(10), { ruleName: r.name, cancelMode: "keep" }, r.owner);
  }
  for (const [uc, cc, , by] of manual) {
    const e = enrollments.find((x) => x.userId === user(uc).id && x.courseId === course(cc).id)!;
    log(user(by), "ENROLLMENTS_ASSIGNED", "Course", course(cc).id, new Date(e.createdAt as Date).getTime(), { courseCode: cc, source: "ASSIGNED", created: 1 }, user(by).companyCode);
  }
  const extended = enrollments.filter((e) => e.status === "IN_PROGRESS" && e.dueDate).slice(0, 4);
  for (const e of extended) {
    const u = users.find((x) => x.id === e.userId)!;
    const ec = courses.find((x) => x.id === e.courseId)!;
    log(caOf(u.companyCode), "ENROLLMENT_EXTENDED", "Enrollment", e.id!, ago(rng.int(2, 8)), { learnerName: u.name, courseCode: ec.code, before: { dueDate: vnIsoDate(at(new Date(e.dueDate as Date).getTime() - 7 * DAY)) }, after: { dueDate: vnIsoDate(e.dueDate as Date) } });
  }
  log(admin, "CERTIFICATE_TEMPLATE_UPDATED", "Company", tong.id, ago(100), { companyCode: "TONG", changedFields: ["certificateSignerName", "certificateSignerTitle"] }, "TONG");
  log(admin, "SETTINGS_UPDATED", "System", null, ago(90), { groupTitle: "Nhắc nhở", changed: 1 }, "TONG");
  log(user("MG-KD"), "REPORT_EXPORTED", "Report", null, ago(2), { tab: "courses", tabLabel: "Theo khoá học", rows: 8 });
  // Tác vụ hằng ngày 30 ngày gần nhất (trang Hệ thống › Tác vụ hằng ngày)
  for (let d = 30; d >= 1; d--) {
    const counts = { dueSoon: rng.int(0, 6), overdue: rng.int(0, 5), quizGraded: rng.int(0, 2), certExpiring: rng.int(0, 2), certExpiredReset: rng.int(0, 1), notificationsDeleted: rng.int(0, 30), ackOverdue: rng.int(0, 3), bunnyStatusSynced: 0, bunnyPendingCleaned: 0 };
    const errors = d === 12 ? { bunnyStatusSynced: "Không kết nối được Bunny Stream (timeout)" } : {};
    audit.push({ id: newId(), actorId: d === 5 ? admin.id : null, companyId: null, action: "JOB_DAILY_RUN", entityType: "System", entityId: null, metadata: { trigger: d === 5 ? "manual" : "cron", counts, errors, durationMs: rng.int(600, 3500) }, createdAt: at(ago(d) - (NOW % DAY) + 19 * HOUR + rng.int(0, 600) * 1000) });
  }

  // ---------------- Cài đặt ----------------
  const settings = Object.entries(SETTING_META)
    .filter(([, m]) => m.default !== null)
    .map(([key, m]) => ({ key, value: m.default as Prisma.InputJsonValue }));

  // ---------------- Ghi ----------------
  await insert("enrollments", enrollments, (d) => prisma.enrollment.createMany({ data: d }));
  await insert("lesson_progress", progress, (d) => prisma.lessonProgress.createMany({ data: d }));
  await insert("quiz_attempts", attempts, (d) => prisma.quizAttempt.createMany({ data: d }));
  await insert("certificates", certificates, (d) => prisma.certificate.createMany({ data: d }));
  await insert("course_reviews", reviews, (d) => prisma.courseReview.createMany({ data: d }));
  await insert("notifications", notifications, (d) => prisma.notification.createMany({ data: d, skipDuplicates: true }));
  await insert("audit_logs", audit, (d) => prisma.auditLog.createMany({ data: d }));
  await insert("system_settings", settings, (d) => prisma.systemSetting.createMany({ data: d }));

  // ---------------- Báo cáo ----------------
  console.log("\nSố bản ghi:");
  for (const [k, v] of counts) console.log(`  ${k.padEnd(22)} ${v}`);
  const byStatus = enrollments.reduce<Record<string, number>>((m, e) => ((m[e.status as string] = (m[e.status as string] ?? 0) + 1), m), {});
  console.log(`\nLượt học theo trạng thái: ${JSON.stringify(byStatus)}`);
  console.log(`\nTài khoản (mật khẩu: ${PASSWORD}) — chi tiết ở docs/demo-data.md:`);
  const show = (role: Role) => users.filter((u) => u.role === role).map((u) => u.code).join(", ");
  console.log(`  Admin tập đoàn : ${show("GROUP_ADMIN")}`);
  console.log(`  Admin công ty  : ${show("COMPANY_ADMIN")}`);
  console.log(`  Biên soạn      : ${show("CONTENT_EDITOR")}`);
  console.log(`  Trưởng phòng   : ${show("MANAGER")}`);
  console.log(`  Học viên mẫu   : TM-001 (đủ trạng thái), TM-002, TM-015 (mới vào) … tổng ${users.filter((u) => u.role === "LEARNER").length} học viên`);
}

main()
  .then(() => console.log("\n✔ Xong."))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
