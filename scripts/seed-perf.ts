/**
 * Sinh dữ liệu giả cho database ĐO HIỆU NĂNG (Việc 30):   npm run perf:seed -- --scale 1 [--anchor 2026-11-23]
 *
 * - Chỉ chạy với DATABASE_URL tới elearning_perf (.env.perf). XOÁ SẠCH dữ liệu cũ của elearning_perf trước khi sinh.
 * - Ngẫu nhiên có hạt giống cố định (mulberry32, seed = 2026 × scale) + mốc thời gian (`--anchor`, mặc định hôm nay):
 *   cùng scale + cùng anchor → đúng bộ dữ liệu (kể cả id). Mọi thời điểm rải trong 12 tháng trước mốc.
 * - Mô phỏng dòng thời gian của từng lượt học để đúng các quy tắc ở docs/database.md: hoàn thành → bản MAJOR / chứng nhận hết hạn
 *   → học lại (giữ completedVersion / acknowledgedVersion), tiến độ học tuần tự, điểm thi theo phiên bản, chứng nhận chỉ khi hoàn thành...
 * - Ghi theo lô createMany ≤ 5.000 dòng. In bảng số dòng + kiểm tra bất biến khi xong.
 *
 * Tài khoản thử tay (mật khẩu Perf12345): PERF-GA, PERF-CA1, PERF-MG1, PERF-CE1, PERF-LN1 (+ PERF-LN2…PERF-LN20 để đo đồng thời).
 *
 * `--extreme` (Việc 32, mặc định TẮT để không đổi số đo / snapshot Việc 30): thêm vài dòng cực đoan để rà giao diện —
 * người tên 80 ký tự (PERF-X-LONG), khoá tên 200 ký tự (PERF-X-LONG-COURSE), khoá nháp 0 bài (PERF-X-EMPTY),
 * người 0 khoá (PERF-X-NOCOURSE), phòng ban 5 cấp (XL1…XL5, trưởng phòng PERF-X-MG), thông báo rất dài (PERF-LN1, PERF-X-LONG).
 */
import bcrypt from "bcryptjs";
import type { EnrollmentSource, EnrollmentStatus, LessonType, Prisma, Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { vnDayEnd, vnIsoDate } from "@/lib/format";
import { DAY, Rng, argOf, assertPerfDatabase, idFactory } from "./perf/common";

assertPerfDatabase();

const SCALE = Math.max(1, Math.min(4, Number(argOf("scale") ?? 1) || 1));
const ANCHOR_DAY = argOf("anchor") ?? vnIsoDate();
if (!/^\d{4}-\d{2}-\d{2}$/.test(ANCHOR_DAY)) throw new Error("--anchor phải dạng yyyy-mm-dd");
/** Mốc “bây giờ” của bộ dữ liệu: 12:00 giờ VN ngày anchor */
const NOW = new Date(`${ANCHOR_DAY}T12:00:00+07:00`).getTime();
const YEAR_AGO = NOW - 365 * DAY;
const PASSWORD = "Perf12345";
const EXTREME = argOf("extreme") === "true";
const BATCH = 5000;

const rng = new Rng(2026 * SCALE);
const newId = idFactory(rng);

// ---------------------------------------------------------------------------------------------
// Tiện ích

const at = (t: number) => new Date(Math.round(t));
const clampNow = (t: number) => Math.min(t, NOW - 60_000);
const between = (a: number, b: number) => (b <= a ? a : a + rng.next() * (b - a));
const dueOf = (t: number, days: number) => vnDayEnd(vnIsoDate(at(t + days * DAY)));
const addMonths = (t: number, m: number) => {
  const d = new Date(t);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.getTime();
};

async function insertMany(label: string, rows: unknown[], fn: (data: never[]) => Promise<unknown>) {
  for (let i = 0; i < rows.length; i += BATCH) await fn(rows.slice(i, i + BATCH) as never[]);
  counts.set(label, (counts.get(label) ?? 0) + rows.length);
}
const counts = new Map<string, number>();

const HO = ["Nguyễn", "Trần", "Lê", "Phạm", "Hoàng", "Huỳnh", "Phan", "Vũ", "Võ", "Đặng", "Bùi", "Đỗ", "Hồ", "Ngô", "Dương", "Lý"];
const DEM = ["Văn", "Thị", "Minh", "Thu", "Quốc", "Ngọc", "Hữu", "Thanh", "Đức", "Bảo", "Gia", "Hoài", "Kim", "Xuân"];
const TEN = ["An", "Bình", "Châu", "Dũng", "Giang", "Hà", "Hải", "Hiếu", "Hoa", "Hùng", "Hương", "Khánh", "Lan", "Linh", "Long", "Mai", "Nam", "Ngân", "Phong", "Phúc", "Quân", "Quỳnh", "Sơn", "Tâm", "Thảo", "Thắng", "Trang", "Trung", "Tú", "Tuấn", "Uyên", "Vy", "Yến"];
const fullName = () => `${rng.pick(HO)} ${rng.pick(DEM)} ${rng.pick(TEN)}`;
const YT_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
const CERT_CHARS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// ---------------------------------------------------------------------------------------------
// Kiểu nội bộ

type Company = { id: string; code: string; name: string; parentId: string | null; share: number; deptCount: number };
type Dept = { id: string; companyId: string; parentId: string | null; level: number; code: string; name: string; managerId: string | null };
type User = {
  id: string;
  code: string;
  name: string;
  role: Role;
  active: boolean;
  companyId: string;
  departmentId: string | null;
  positionId: string | null;
  hiredAt: number;
};
type Version = { id: string; no: number; type: "INITIAL" | "MINOR" | "MAJOR"; at: number; dueInDays: number | null };
type LessonRow = { id: string; type: LessonType; maxAttempts: number | null; passingScore: number; duration: number | null };
type Course = {
  id: string;
  code: string;
  title: string;
  ownerCompanyId: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  createdAt: number;
  versions: Version[];
  currentVersion: number;
  allowSelfEnroll: boolean;
  hasCertificate: boolean;
  validMonths: number | null;
  lessons: LessonRow[];
  questionIds: { id: string; type: "SINGLE" | "MULTIPLE"; options: { id: string; text: string; isCorrect: boolean }[]; content: string }[];
};
type Rule = {
  id: string;
  ownerCompanyId: string;
  targetCompanyId: string | null;
  departmentIds: Set<string> | null;
  positionId: string | null;
  courseId: string | null;
  pathId: string | null;
  dueInDays: number;
  isActive: boolean;
  createdAt: number;
  deptRoot: string | null;
};

// ---------------------------------------------------------------------------------------------

async function wipe() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  }
}

async function main() {
  const started = Date.now();
  console.log(`→ Sinh dữ liệu đo hiệu năng: scale ${SCALE}, mốc ${ANCHOR_DAY} 12:00 (giờ VN), seed ${2026 * SCALE}`);
  await wipe();
  // Muối cố định (chỉ dữ liệu đo) → chạy lại ra đúng từng byte; vẫn là bcrypt cost 12 như thật
  const passwordHash = await bcrypt.hash(PASSWORD, "$2b$12$PerfSeedFixedSaltForE.L");

  // ---------------- Công ty, chức danh, danh mục ----------------
  const companies: Company[] = [
    { id: newId(), code: "TONG", name: "Tập đoàn (Perf)", parentId: null, share: 0.25, deptCount: 15 },
    { id: newId(), code: "CTY1", name: "Công ty Thành viên 1", parentId: null, share: 0.35, deptCount: 20 },
    { id: newId(), code: "CTY2", name: "Công ty Thành viên 2", parentId: null, share: 0.15, deptCount: 9 },
    { id: newId(), code: "CTY3", name: "Công ty Thành viên 3", parentId: null, share: 0.15, deptCount: 9 },
    { id: newId(), code: "CTY4", name: "Công ty Thành viên 4", parentId: null, share: 0.1, deptCount: 7 },
  ];
  const [tong, cty1] = companies;
  for (const c of companies.slice(1)) c.parentId = tong.id;
  await insertMany("companies", companies.map((c) => ({ id: c.id, code: c.code, name: c.name, parentId: c.parentId, createdAt: at(YEAR_AGO - 30 * DAY), updatedAt: at(YEAR_AGO - 30 * DAY) })), (d) =>
    prisma.company.createMany({ data: d }),
  );

  const positions = [
    ["GD", "Giám đốc"], ["TP", "Trưởng phòng"], ["NVKD", "Nhân viên kinh doanh"], ["KT", "Kế toán"],
    ["NVHC", "Nhân viên hành chính"], ["KHO", "Nhân viên kho"], ["IT", "Kỹ thuật viên"],
  ].map(([code, name]) => ({ id: newId(), code, name }));
  await insertMany("positions", positions, (d) => prisma.position.createMany({ data: d }));
  const posId = (code: string) => positions.find((p) => p.code === code)!.id;
  const staffPositions = positions.filter((p) => !["GD", "TP"].includes(p.code)).map((p) => p.id);

  const categories = ["Văn hoá – Nội quy", "Quy trình", "Kỹ năng", "An toàn", "Sản phẩm", "Bán hàng"].map((name, i) => ({ id: newId(), name, sortOrder: i }));
  await insertMany("course_categories", categories, (d) => prisma.courseCategory.createMany({ data: d }));

  // ---------------- Phòng ban 3 cấp ----------------
  const depts: Dept[] = [];
  for (const c of companies) {
    const n = c.deptCount * SCALE;
    const l1n = Math.max(2, Math.round(n * 0.25));
    const l2n = Math.round(n * 0.45);
    const l3n = n - l1n - l2n;
    const l1: Dept[] = [], l2: Dept[] = [];
    for (let i = 0; i < l1n; i++) l1.push({ id: newId(), companyId: c.id, parentId: null, level: 1, code: `P${i + 1}`, name: `Phòng ${i + 1}`, managerId: null });
    for (let i = 0; i < l2n; i++) {
      // Công ty con lớn nhất: phòng 1 có ≥ 4 phòng con (cho PERF-MG1)
      const parent = c === cty1 && i < 4 ? l1[0] : rng.pick(l1);
      l2.push({ id: newId(), companyId: c.id, parentId: parent.id, level: 2, code: `${parent.code}-N${i + 1}`, name: `Nhóm ${i + 1} – ${parent.name}`, managerId: null });
    }
    for (let i = 0; i < l3n; i++) {
      const parent = rng.pick(l2);
      depts.push({ id: newId(), companyId: c.id, parentId: parent.id, level: 3, code: `${parent.code}-T${i + 1}`, name: `Tổ ${i + 1}`, managerId: null });
    }
    depts.push(...l1, ...l2);
  }
  const childrenOf = new Map<string, string[]>();
  for (const d of depts) if (d.parentId) childrenOf.set(d.parentId, [...(childrenOf.get(d.parentId) ?? []), d.id]);
  const subtree = (id: string): string[] => [id, ...(childrenOf.get(id) ?? []).flatMap(subtree)];

  // ---------------- Người dùng ----------------
  const TOTAL = 1000 * SCALE;
  const users: User[] = [];
  const mk = (u: Omit<User, "id" | "name" | "hiredAt"> & { name?: string; hiredAt?: number }): User => {
    // `...u` trước: tham số để trống (undefined) không được ghi đè giá trị sinh ngẫu nhiên
    const user: User = { ...u, id: newId(), name: u.name ?? fullName(), hiredAt: u.hiredAt ?? (rng.chance(0.12) ? between(YEAR_AGO, NOW - 20 * DAY) : between(NOW - 8 * 365 * DAY, YEAR_AGO)) };
    users.push(user);
    return user;
  };
  const deptsOf = (companyId: string) => depts.filter((d) => d.companyId === companyId);
  const mg1Dept = depts.find((d) => d.companyId === cty1.id && d.level === 1 && d.code === "P1")!;

  const ga = mk({ code: "PERF-GA", role: "GROUP_ADMIN", active: true, companyId: tong.id, departmentId: null, positionId: posId("GD"), name: "Quản trị Tập đoàn" });
  const companyAdmin = new Map<string, User>();
  for (const c of companies) {
    companyAdmin.set(c.id, mk({ code: c === cty1 ? "PERF-CA1" : `PERF-CA-${c.code}`, role: "COMPANY_ADMIN", active: true, companyId: c.id, departmentId: null, positionId: posId("TP") }));
  }
  const editors: User[] = [];
  for (let i = 0; i < 10; i++) {
    const c = i < 4 ? tong : companies[1 + ((i - 4) % 4)];
    editors.push(mk({ code: i === 0 ? "PERF-CE1" : `PERF-CE${i + 1}`, role: "CONTENT_EDITOR", active: true, companyId: c.id, departmentId: rng.pick(deptsOf(c.id)).id, positionId: posId("NVHC") }));
  }
  // Trưởng phòng: mỗi phòng 1 người, làm việc trong chính phòng đó
  for (const d of depts) {
    const m = mk({ code: d === mg1Dept ? "PERF-MG1" : `M-${companies.find((c) => c.id === d.companyId)!.code}-${d.code}`, role: "MANAGER", active: true, companyId: d.companyId, departmentId: d.id, positionId: posId("TP") });
    d.managerId = m.id;
  }
  // Học viên: chia theo tỉ lệ công ty; trong công ty, cây phòng 1 của CTY1 (PERF-MG1) đông hơn
  const fixedCount = users.length;
  const learnersPerCompany = companies.map((c) => Math.round((TOTAL - fixedCount) * c.share));
  learnersPerCompany[0] += TOTAL - fixedCount - learnersPerCompany.reduce((a, b) => a + b, 0);
  const mg1Subtree = new Set(subtree(mg1Dept.id));
  let lnNo = 0;
  companies.forEach((c, ci) => {
    const ds = deptsOf(c.id);
    const weights = ds.map((d) => [d, mg1Subtree.has(d.id) ? 1.05 : 1] as const);
    for (let i = 0; i < learnersPerCompany[ci]; i++) {
      // 20 học viên đo đồng thời: PERF-LN1 ở cây phòng của PERF-MG1, còn lại rải đều
      const fixed = lnNo < 20 && ci > 0 && (lnNo === 0 ? ci === 1 && i === 0 : ci === 1 ? i % 30 === 0 : i % 25 === 0);
      const dept = fixed && lnNo === 0 ? rng.pick(ds.filter((d) => mg1Subtree.has(d.id) && d.level === 2)) : rng.weighted(weights);
      const code = fixed ? `PERF-LN${++lnNo}` : `${c.code}-${String(i + 1).padStart(4, "0")}`;
      mk({ code, role: "LEARNER", active: fixed ? true : !rng.chance(0.04), companyId: c.id, departmentId: dept.id, positionId: rng.pick(staffPositions), hiredAt: fixed ? NOW - 400 * DAY : undefined });
    }
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  // users.departmentId → departments và departments.managerId → users tham chiếu vòng nhau:
  // tạo phòng ban (chưa có trưởng phòng) theo cấp → người dùng → gán trưởng phòng
  for (const level of [1, 2, 3]) {
    await insertMany("departments", depts.filter((d) => d.level === level).map((d) => ({ id: d.id, companyId: d.companyId, parentId: d.parentId, code: d.code, name: d.name, createdAt: at(YEAR_AGO - 30 * DAY), updatedAt: at(YEAR_AGO - 30 * DAY) })), (x) =>
      prisma.department.createMany({ data: x }),
    );
  }
  await insertMany("users", users.map((u) => ({
    id: u.id,
    employeeCode: u.code,
    passwordHash,
    mustChangePassword: false,
    fullName: u.name,
    email: `${u.code.toLowerCase()}@perf.vn`,
    phone: `09${String(rng.int(10_000_000, 99_999_999))}`,
    role: u.role,
    status: u.active ? ("ACTIVE" as const) : ("INACTIVE" as const),
    companyId: u.companyId,
    departmentId: u.departmentId,
    positionId: u.positionId,
    hireDate: new Date(`${vnIsoDate(at(u.hiredAt))}T00:00:00Z`),
    lastLoginAt: u.active ? at(between(NOW - 30 * DAY, NOW)) : null,
    createdAt: at(Math.max(u.hiredAt, YEAR_AGO - 20 * DAY)),
    updatedAt: at(Math.max(u.hiredAt, YEAR_AGO - 20 * DAY)),
  })), (d) => prisma.user.createMany({ data: d }));
  const managed = depts.filter((d) => d.managerId);
  await prisma.$executeRawUnsafe(
    `UPDATE departments d SET "managerId" = v.m FROM (VALUES ${managed.map((d) => `('${d.id}', '${d.managerId}')`).join(",")}) AS v(id, m) WHERE d.id = v.id`,
  );

  // ---------------- Khoá học ----------------
  const ownerPlan: [Company, number][] = [[tong, 27], [cty1, 11], [companies[2], 4], [companies[3], 4], [companies[4], 4]];
  const draftAt = new Set(["TONG:0", "TONG:1", "CTY2:0", "CTY3:0", "CTY4:0"]);
  const archivedAt = new Set(["TONG:2", "TONG:3", "TONG:4", "CTY1:0", "CTY2:1"]);
  const courses: Course[] = [];
  let multiVersionLeft = 15 * SCALE;
  for (const [c, n0] of ownerPlan) {
    for (let i = 0; i < n0 * SCALE; i++) {
      const key = `${c.code}:${i}`;
      const status = draftAt.has(key) ? "DRAFT" : archivedAt.has(key) ? "ARCHIVED" : "PUBLISHED";
      const createdAt = status === "DRAFT" ? between(NOW - 60 * DAY, NOW - 5 * DAY) : between(YEAR_AGO - 40 * DAY, YEAR_AGO + 30 * DAY);
      const versions: Version[] = [];
      if (status !== "DRAFT") {
        versions.push({ id: newId(), no: 1, type: "INITIAL", at: createdAt + rng.int(3, 10) * DAY, dueInDays: null });
        if (status === "PUBLISHED" && multiVersionLeft > 0 && rng.chance(0.45)) {
          multiVersionLeft--;
          const extra = rng.int(1, 3);
          let t = versions[0].at;
          for (let v = 0; v < extra; v++) {
            t = between(t + 30 * DAY, Math.min(NOW - 3 * DAY, t + 160 * DAY));
            const type = rng.chance(0.4) ? "MAJOR" : "MINOR";
            versions.push({ id: newId(), no: v + 2, type, at: t, dueInDays: type === "MAJOR" ? 30 : 14 });
          }
        }
      }
      const hasCertificate = rng.chance(0.8);
      courses.push({
        id: newId(),
        code: `${c.code}-K${String(i + 1).padStart(3, "0")}`,
        title: `Khoá ${i + 1}: ${rng.pick(["Quy trình", "Kỹ năng", "An toàn", "Sản phẩm", "Văn hoá", "Bán hàng"])} ${rng.pick(["cơ bản", "nâng cao", "thực hành", "cập nhật"])} (${c.code})`,
        ownerCompanyId: c.id,
        status,
        createdAt,
        versions,
        currentVersion: versions.length,
        allowSelfEnroll: status === "PUBLISHED" && rng.chance(0.3),
        hasCertificate,
        validMonths: hasCertificate ? rng.weighted([[12, 0.4], [6, 0.25], [null, 0.35]] as const) : null,
        lessons: [],
        questionIds: [],
      });
    }
  }
  // Ép đủ 15 khoá nhiều phiên bản (nếu ngẫu nhiên chưa đủ)
  for (const c of courses) {
    if (multiVersionLeft <= 0) break;
    if (c.status !== "PUBLISHED" || c.versions.length > 1) continue;
    multiVersionLeft--;
    const t = between(c.versions[0].at + 40 * DAY, NOW - 10 * DAY);
    const type = rng.chance(0.5) ? "MAJOR" : "MINOR";
    c.versions.push({ id: newId(), no: 2, type, at: t, dueInDays: type === "MAJOR" ? 30 : 14 });
    c.currentVersion = 2;
  }

  // Chương + bài + câu hỏi
  const sections: Prisma.CourseSectionCreateManyInput[] = [];
  const lessons: Prisma.LessonCreateManyInput[] = [];
  const questions: Prisma.QuestionCreateManyInput[] = [];
  for (const c of courses) {
    const nSec = rng.weighted([[3, 0.4], [4, 0.4], [5, 0.2]] as const);
    for (let s = 0; s < nSec; s++) {
      const sectionId = newId();
      sections.push({ id: sectionId, courseId: c.id, title: `Chương ${s + 1}`, sortOrder: s, createdAt: at(c.createdAt) });
      const nLes = rng.weighted([[3, 0.4], [4, 0.4], [5, 0.2]] as const);
      for (let l = 0; l < nLes; l++) {
        const last = s === nSec - 1 && l === nLes - 1;
        const type: LessonType = last ? "QUIZ" : rng.weighted([["VIDEO", 0.47], ["DOCUMENT", 0.43], ["QUIZ", 0.1]] as const);
        const id = newId();
        const base = { id, sectionId, title: `Bài ${s + 1}.${l + 1}`, type, sortOrder: l, createdAt: at(c.createdAt), updatedAt: at(c.createdAt) };
        if (type === "VIDEO") {
          const duration = rng.int(180, 1200);
          let vid = "";
          for (let k = 0; k < 11; k++) vid += YT_CHARS[rng.int(0, YT_CHARS.length - 1)];
          lessons.push({ ...base, videoProvider: "YOUTUBE", videoId: vid, videoStatus: "READY", durationSeconds: duration, minWatchPercent: 90 });
          c.lessons.push({ id, type, maxAttempts: null, passingScore: 0, duration });
        } else if (type === "DOCUMENT") {
          lessons.push({ ...base, content: `<h2>Bài ${s + 1}.${l + 1}</h2><p>Nội dung quy trình mẫu để đo hiệu năng. Đọc kỹ các bước và lưu ý an toàn.</p><ul><li>Bước 1</li><li>Bước 2</li></ul>` });
          c.lessons.push({ id, type, maxAttempts: null, passingScore: 0, duration: null });
        } else {
          const maxAttempts = rng.weighted([[3, 0.5], [null, 0.3], [2, 0.2]] as const);
          const passingScore = rng.pick([60, 70, 80]);
          lessons.push({ ...base, questionCount: 5, passingScore, timeLimitMinutes: 15, maxAttempts, showAnswers: rng.chance(0.4) });
          c.lessons.push({ id, type, maxAttempts, passingScore, duration: null });
        }
      }
    }
    for (let q = 0; q < 30; q++) {
      const multiple = rng.chance(0.2);
      const correct = new Set(multiple ? rng.sample([0, 1, 2, 3], 2) : [rng.int(0, 3)]);
      const options = ["a", "b", "c", "d"].map((oid, i) => ({ id: oid, text: `Phương án ${oid.toUpperCase()}`, isCorrect: correct.has(i) }));
      const id = newId();
      const content = `Câu ${q + 1} — ${c.code}: chọn phương án đúng?`;
      questions.push({ id, courseId: c.id, type: multiple ? "MULTIPLE" : "SINGLE", content, options, explanation: rng.chance(0.5) ? "Giải thích ngắn." : null, isActive: rng.chance(0.97), createdAt: at(c.createdAt), updatedAt: at(c.createdAt) });
      c.questionIds.push({ id, type: multiple ? "MULTIPLE" : "SINGLE", options, content });
    }
  }

  const publisherOf = (c: Course) => (c.ownerCompanyId === tong.id ? (rng.chance(0.5) ? ga : companyAdmin.get(tong.id)!) : companyAdmin.get(c.ownerCompanyId)!);
  await insertMany("courses", courses.map((c) => ({
    id: c.id,
    ownerCompanyId: c.ownerCompanyId,
    categoryId: rng.pick(categories).id,
    code: c.code,
    title: c.title,
    description: "Khoá học sinh tự động để đo hiệu năng.",
    status: c.status,
    currentVersion: c.currentVersion,
    allowSelfEnroll: c.allowSelfEnroll,
    hasCertificate: c.hasCertificate,
    certificateValidMonths: c.validMonths,
    createdAt: at(c.createdAt),
    updatedAt: at(c.versions.at(-1)?.at ?? c.createdAt),
  })), (d) => prisma.course.createMany({ data: d }));
  await insertMany("course_versions", courses.flatMap((c) => c.versions.map((v) => ({
    id: v.id,
    courseId: c.id,
    versionNo: v.no,
    changeType: v.type,
    status: "PUBLISHED" as const,
    changeSummary: v.type === "INITIAL" ? null : `<p>Cập nhật ${v.type === "MAJOR" ? "lớn" : "nhỏ"}: thay đổi các bước của quy trình.</p>`,
    dueInDays: v.dueInDays,
    publishedById: publisherOf(c).id,
    publishedAt: at(v.at),
    createdAt: at(v.at),
  }))), (d) => prisma.courseVersion.createMany({ data: d }));
  await insertMany("course_sections", sections, (d) => prisma.courseSection.createMany({ data: d }));
  await insertMany("lessons", lessons, (d) => prisma.lesson.createMany({ data: d }));
  await insertMany("questions", questions, (d) => prisma.question.createMany({ data: d }));

  const courseById = new Map(courses.map((c) => [c.id, c]));
  const visibleCourses = (companyId: string) => courses.filter((c) => c.status !== "DRAFT" && (c.ownerCompanyId === tong.id || c.ownerCompanyId === companyId));

  // ---------------- Lộ trình ----------------
  const pathPlan: [Company, "PUBLISHED" | "DRAFT" | "ARCHIVED"][] = [
    [tong, "PUBLISHED"], [tong, "PUBLISHED"], [tong, "PUBLISHED"], [tong, "DRAFT"],
    [cty1, "PUBLISHED"], [cty1, "PUBLISHED"], [cty1, "ARCHIVED"],
    [companies[2], "PUBLISHED"], [companies[3], "PUBLISHED"], [companies[4], "PUBLISHED"],
  ];
  const paths: { id: string; ownerCompanyId: string; status: string; courseIds: string[] }[] = [];
  for (let s = 0; s < SCALE; s++) {
    for (const [c, status] of pathPlan) {
      const pool = courses.filter((x) => x.status === "PUBLISHED" && (x.ownerCompanyId === c.id || x.ownerCompanyId === tong.id));
      paths.push({ id: newId(), ownerCompanyId: c.id, status, courseIds: rng.sample(pool, rng.int(3, 4)).map((x) => x.id) });
    }
  }
  await insertMany("learning_paths", paths.map((p, i) => ({ id: p.id, ownerCompanyId: p.ownerCompanyId, code: `LT-${String(i + 1).padStart(3, "0")}`, title: `Lộ trình ${i + 1}`, status: p.status as "PUBLISHED", createdAt: at(YEAR_AGO + 5 * DAY), updatedAt: at(YEAR_AGO + 5 * DAY) })), (d) =>
    prisma.learningPath.createMany({ data: d }),
  );
  await insertMany("learning_path_courses", paths.flatMap((p) => p.courseIds.map((courseId, i) => ({ learningPathId: p.id, courseId, sortOrder: i }))), (d) =>
    prisma.learningPathCourse.createMany({ data: d }),
  );

  // ---------------- Quy tắc giao ----------------
  const rules: Rule[] = [];
  for (let i = 0; i < 20 * SCALE; i++) {
    const byTong = i % 20 < 8;
    const owner = byTong ? tong : companies[1 + (i % 4)];
    const target = byTong ? (i % 20 < 5 ? null : companies[1 + (i % 4)].id) : owner.id;
    const usePath = i % 5 === 4;
    const pathPool = paths.filter((p) => p.status === "PUBLISHED" && p.ownerCompanyId === owner.id);
    const coursePool = courses.filter((c) => c.status === "PUBLISHED" && (c.ownerCompanyId === owner.id || (!byTong && c.ownerCompanyId === tong.id)));
    const path = usePath && pathPool.length ? rng.pick(pathPool) : null;
    const dept = !byTong && rng.chance(0.4) ? rng.pick(deptsOf(owner.id).filter((d) => d.level === 1)) : null;
    rules.push({
      id: newId(),
      ownerCompanyId: owner.id,
      targetCompanyId: target,
      departmentIds: dept ? new Set(subtree(dept.id)) : null,
      positionId: rng.chance(0.2) ? rng.pick(staffPositions) : null,
      courseId: path ? null : rng.pick(coursePool).id,
      pathId: path?.id ?? null,
      dueInDays: rng.pick([14, 30, 45, 60]),
      isActive: rng.chance(0.9),
      createdAt: between(YEAR_AGO + 10 * DAY, YEAR_AGO + 120 * DAY),
      deptRoot: dept?.id ?? null,
    });
  }
  await insertMany("assignment_rules", rules.map((r, i) => ({
    id: r.id,
    ownerCompanyId: r.ownerCompanyId,
    name: `Quy tắc ${i + 1}`,
    courseId: r.courseId,
    learningPathId: r.pathId,
    targetCompanyId: r.targetCompanyId,
    departmentId: r.deptRoot,
    includeSubDepartments: true,
    positionId: r.positionId,
    dueInDays: r.dueInDays,
    isActive: r.isActive,
    createdAt: at(r.createdAt),
    updatedAt: at(r.createdAt),
  })), (d) => prisma.assignmentRule.createMany({ data: d }));
  const ruleMatches = (r: Rule, u: User) =>
    (r.targetCompanyId === null || r.targetCompanyId === u.companyId) &&
    (!r.departmentIds || (u.departmentId !== null && r.departmentIds.has(u.departmentId))) &&
    (!r.positionId || r.positionId === u.positionId);

  // ---------------- Lượt học + mọi thứ đi theo ----------------
  const enrollments: Prisma.EnrollmentCreateManyInput[] = [];
  const progress: Prisma.LessonProgressCreateManyInput[] = [];
  const attempts: Prisma.QuizAttemptCreateManyInput[] = [];
  const certificates: Prisma.CertificateCreateManyInput[] = [];
  const reviews: Prisma.CourseReviewCreateManyInput[] = [];
  const notifications: Prisma.NotificationCreateManyInput[] = [];
  const certCodes = new Set<string>();
  const attemptCount = new Map<string, number>();
  const companyName = new Map(companies.map((c) => [c.id, c.name]));

  const versionAt = (c: Course, t: number) => c.versions.reduce((v, x) => (x.at <= t ? x.no : v), 1);
  const notify = (userId: string, type: string, title: string, t: number, link: string | null, dedupeKey: string | null = null) => {
    const age = NOW - t;
    // Steady state sau 1 năm có tác vụ dọn: thông báo đã đọc > 180 ngày đã bị xoá → cái cũ còn lại là chưa đọc
    const read = age <= 180 * DAY && rng.chance(0.75);
    notifications.push({ id: newId(), userId, type, title, link, dedupeKey, readAt: read ? at(clampNow(t + rng.int(1, 72) * 3_600_000)) : null, createdAt: at(t) });
  };

  const certCode = (t: number) => {
    for (;;) {
      let s = "";
      for (let k = 0; k < 6; k++) s += CERT_CHARS[rng.int(0, CERT_CHARS.length - 1)];
      const code = `CERT-${new Date(t).getUTCFullYear()}-${s}`;
      if (!certCodes.has(code)) return certCodes.add(code), code;
    }
  };

  /** Lượt làm bài cho 1 bài QUIZ: n lượt, lượt cuối đạt nếu `pass`. */
  function quizAttempts(c: Course, l: LessonRow, userId: string, t: number, pass: boolean) {
    const version = versionAt(c, t);
    const key = `${l.id}|${userId}|${version}`;
    const used = attemptCount.get(key) ?? 0;
    const room = l.maxAttempts === null ? 3 : l.maxAttempts - used;
    if (room <= 0) return;
    const n = Math.min(room, pass ? rng.weighted([[1, 0.6], [2, 0.3], [3, 0.1]] as const) : rng.int(1, 2));
    for (let k = 0; k < n; k++) {
      const passed = pass && k === n - 1;
      const started = t - (n - k) * rng.int(20, 120) * 60_000;
      const picked = rng.sample(c.questionIds, 5);
      const correctN = passed ? (l.passingScore <= 80 && rng.chance(0.4) ? 4 : 5) : rng.int(0, 2);
      const answers = picked.map((q, qi) => ({
        questionId: q.id,
        type: q.type,
        content: q.content,
        imageUrl: null,
        explanation: null,
        options: q.options,
        selected: qi < correctN ? q.options.filter((o) => o.isCorrect).map((o) => o.id) : [q.options.find((o) => !o.isCorrect)!.id],
      }));
      const score = Math.round((correctN / 5) * 100);
      attemptCount.set(key, used + k + 1);
      attempts.push({
        id: newId(),
        lessonId: l.id,
        userId,
        courseVersion: version,
        attemptNo: used + k + 1,
        answers,
        score,
        passed: score >= l.passingScore,
        startedAt: at(started),
        submittedAt: at(started + rng.int(4, 14) * 60_000),
      });
    }
  }

  /** Tiến độ k bài đầu đã xong trong [from, to], (tuỳ chọn) bài k đang học dở; bài còn lại có dòng “chưa xong” nếu resetRows. */
  function lessonRows(c: Course, userId: string, k: number, from: number, to: number, opts: { inProgress: boolean; resetRows: boolean; quizzes: boolean }) {
    const n = c.lessons.length;
    for (let i = 0; i < n; i++) {
      const l = c.lessons[i];
      if (i < k) {
        const t = from + ((to - from) * (i + 1)) / Math.max(k, 1);
        if (opts.quizzes && l.type === "QUIZ") quizAttempts(c, l, userId, t, true);
        progress.push({ id: newId(), userId, lessonId: l.id, isCompleted: true, completedAt: at(t), maxWatchedSeconds: l.duration ?? 0, lastPositionSeconds: l.duration ?? 0, updatedAt: at(t) });
      } else if (i === k && opts.inProgress) {
        const t = between(to, clampNow(to + 7 * DAY));
        if (opts.quizzes && l.type === "QUIZ") quizAttempts(c, l, userId, t, false);
        const watched = l.duration ? rng.int(10, Math.floor(l.duration * 0.8)) : 0;
        progress.push({ id: newId(), userId, lessonId: l.id, isCompleted: false, maxWatchedSeconds: watched, lastPositionSeconds: watched, updatedAt: at(t) });
      } else if (opts.resetRows) {
        progress.push({ id: newId(), userId, lessonId: l.id, isCompleted: false, updatedAt: at(from) });
      }
    }
  }

  /** Ghi lại 1 lần hoàn thành: tiến độ đủ bài (chỉ cho lần cuối), chứng nhận, thông báo. */
  function completion(c: Course, u: User, enrollmentId: string, t: number) {
    const version = versionAt(c, t);
    let certificateId: string | null = null;
    if (c.hasCertificate) {
      certificateId = newId();
      certificates.push({
        id: certificateId,
        code: certCode(t),
        userId: u.id,
        courseId: c.id,
        courseVersion: version,
        recipientName: u.name,
        courseTitle: c.title,
        issuedAt: at(t),
        expiresAt: c.validMonths ? at(addMonths(t, c.validMonths)) : null,
        revokedAt: rng.chance(0.004) ? at(between(t, NOW)) : null,
        templateSnapshot: { companyName: companyName.get(u.companyId), logoKey: null, signerName: "Nguyễn Văn Ký", signerTitle: "Giám đốc nhân sự", signatureKey: null },
      });
      notify(u.id, "CERTIFICATE_ISSUED", `Bạn nhận chứng nhận khoá ${c.title}`, t, "/certificates", `cert_issued:${certificateId}`);
    }
    void enrollmentId;
    return { version, expiresAt: c.hasCertificate && c.validMonths ? addMonths(t, c.validMonths) : null, certificateId };
  }

  /** Mô phỏng 1 lượt học từ lúc giao tới mốc NOW. */
  function simulate(u: User, c: Course, source: EnrollmentSource, opts: { ruleId: string | null; pathId: string | null; dueDays: number | null; forceNotStarted: boolean; created: number }) {
    const id = newId();
    let created = opts.created;
    const n = c.lessons.length;
    const cert0 = c.hasCertificate;
    let target: EnrollmentStatus = opts.forceNotStarted
      ? "NOT_STARTED"
      : c.status === "ARCHIVED"
        ? rng.weighted([["COMPLETED", 0.75], ["CANCELLED", 0.15], ["IN_PROGRESS", 0.1]] as const)
        : rng.weighted([["COMPLETED", 0.44], ["IN_PROGRESS", 0.2], ["NOT_STARTED", 0.26], ["CANCELLED", 0.1]] as const);
    if (!u.active && target !== "COMPLETED") target = rng.chance(0.5) ? "CANCELLED" : target;
    let due = opts.dueDays ? dueOf(created, opts.dueDays).getTime() : null;

    let status: EnrollmentStatus = target;
    let startedAt: number | null = null;
    let completedAt: number | null = null;
    let completedVersion: number | null = null;
    let ackVersion: number | null = null;
    let ackAt: number | null = null;
    let k = 0;

    const wantsHistory = target === "COMPLETED" || ((target === "IN_PROGRESS" || target === "NOT_STARTED") && rng.chance(0.18));
    // Lượt đang mở chưa từng hoàn thành: phần lớn được giao gần đây (hạn còn ở tương lai) → ~10% lượt học quá hạn như thực tế
    if (!wantsHistory && opts.dueDays && (target === "IN_PROGRESS" || target === "NOT_STARTED") && rng.chance(0.8)) {
      const earliest = Math.max(opts.created - 400 * DAY, c.versions[0]?.at ?? c.createdAt, u.hiredAt);
      created = Math.max(earliest, between(NOW - opts.dueDays * 0.9 * DAY, NOW - 2 * 3_600_000));
      due = dueOf(created, opts.dueDays).getTime();
    }
    if (wantsHistory && NOW - created > 3 * DAY) {
      // Lần hoàn thành đầu
      const window = opts.dueDays ? opts.dueDays * DAY * (rng.chance(0.12) ? 1.6 : 0.9) : 60 * DAY;
      let start = clampNow(created + rng.int(1, 48) * 3_600_000);
      let done = clampNow(start + between(DAY, window));
      for (let round = 0; round < 4; round++) {
        startedAt = start;
        completedAt = done;
        const comp = completion(c, u, id, done);
        completedVersion = comp.version;
        ackVersion = comp.version;
        ackAt = done;
        // Sự kiện bắt học lại sau lần hoàn thành này: bản MAJOR mới, hoặc chứng nhận hết hạn
        const major = c.versions.find((v) => v.type === "MAJOR" && v.at > done);
        const expiry = cert0 && comp.expiresAt && comp.expiresAt < NOW - DAY ? comp.expiresAt : null;
        const reset = [major?.at ?? Infinity, expiry ?? Infinity].reduce((a, b) => Math.min(a, b));
        if (reset === Infinity) {
          status = "COMPLETED";
          break;
        }
        // Lần hoàn thành này bị “xoá” bởi học lại → tiến độ không còn, nhưng lượt làm bài (đạt) vẫn giữ
        for (const l of c.lessons) if (l.type === "QUIZ") quizAttempts(c, l, u.id, done - DAY, true);
        if (major && reset === major.at) {
          notify(u.id, "VERSION_MAJOR", `Khoá ${c.title} có thay đổi lớn — vui lòng học lại`, major.at, `/my-courses/${c.id}`, `version_major:${c.id}:v${major.no}`);
        } else {
          notify(u.id, "CERTIFICATE_EXPIRING", `Chứng nhận khoá ${c.title} sắp hết hạn`, reset - 20 * DAY, "/certificates", null);
        }
        const reDue = reset + (major && reset === major.at ? (major.dueInDays ?? 30) : 30) * DAY;
        if (target === "COMPLETED" && NOW - reset > 5 * DAY && rng.chance(0.6)) {
          start = clampNow(reset + rng.int(1, 72) * 3_600_000);
          done = clampNow(start + between(DAY, Math.min(25 * DAY, NOW - start)));
          due = dueOf(reDue, 0).getTime();
          continue;
        }
        // Đang học lại (giữ completedVersion / acknowledgedVersion — Quy tắc 2, Quy tắc 6)
        status = target === "COMPLETED" ? (rng.chance(0.5) ? "IN_PROGRESS" : "NOT_STARTED") : target === "CANCELLED" ? "IN_PROGRESS" : target;
        due = dueOf(reDue, 0).getTime();
        completedAt = null;
        if (status === "IN_PROGRESS") {
          startedAt = clampNow(reset + rng.int(1, 10) * DAY);
          k = rng.int(0, n - 1);
          lessonRows(c, u.id, k, startedAt, clampNow(startedAt + between(DAY, 20 * DAY)), { inProgress: true, resetRows: true, quizzes: true });
        } else {
          startedAt = null;
          lessonRows(c, u.id, 0, reset, reset, { inProgress: false, resetRows: true, quizzes: false });
        }
        break;
      }
      if (status === "COMPLETED") {
        k = n;
        lessonRows(c, u.id, n, startedAt!, completedAt!, { inProgress: false, resetRows: false, quizzes: true });
        // Bản MINOR phát hành sau khi hoàn thành: 60% đã xác nhận
        const minor = c.versions.filter((v) => v.type === "MINOR" && v.at > completedAt!).at(-1);
        if (minor) {
          notify(u.id, "VERSION_MINOR", `Khoá ${c.title} có cập nhật — đọc và xác nhận`, minor.at, `/my-courses/${c.id}/updates`, null);
          if (rng.chance(0.6)) {
            ackVersion = c.currentVersion;
            ackAt = clampNow(minor.at + rng.int(1, 10) * DAY);
          }
        }
      }
    } else {
      // Chưa từng hoàn thành
      if (target === "COMPLETED") target = "IN_PROGRESS";
      status = target;
      if (target === "IN_PROGRESS" || (target === "CANCELLED" && rng.chance(0.5))) {
        startedAt = clampNow(created + rng.int(1, 96) * 3_600_000);
        k = rng.int(0, n - 1);
        lessonRows(c, u.id, k, startedAt, clampNow(startedAt + between(DAY, 30 * DAY)), { inProgress: true, resetRows: false, quizzes: true });
      }
    }

    const done = status === "COMPLETED";
    const pct = done ? 100 : Math.round((k / n) * 100);
    const lastTouch = Math.max(created, startedAt ?? 0, completedAt ?? 0, ackAt ?? 0);
    enrollments.push({
      id,
      userId: u.id,
      courseId: c.id,
      source,
      assignedById: source === "ASSIGNED" ? (c.ownerCompanyId === tong.id && rng.chance(0.4) ? ga.id : companyAdmin.get(u.companyId)!.id) : null,
      assignmentRuleId: opts.ruleId,
      learningPathId: opts.pathId,
      status,
      progressPercent: pct,
      dueDate: due ? at(due) : null,
      startedAt: startedAt ? at(startedAt) : null,
      completedAt: done ? at(completedAt!) : null,
      completedVersion,
      acknowledgedVersion: ackVersion,
      acknowledgedAt: ackAt ? at(ackAt) : null,
      createdAt: at(created),
      updatedAt: at(lastTouch),
    });

    // Thông báo theo vòng đời
    if (source !== "SELF") notify(u.id, "COURSE_ASSIGNED", `Bạn được giao khoá học: ${c.title}`, created, "/my-courses");
    if (due && (status === "NOT_STARTED" || status === "IN_PROGRESS")) {
      const dueDay = vnIsoDate(at(due));
      if (due - 3 * DAY < NOW) notify(u.id, "DUE_SOON", `Khoá ${c.title} sắp đến hạn`, Math.max(created, due - 3 * DAY), `/my-courses/${c.id}`, `due_soon:${id}:${dueDay}`);
      if (due < NOW) {
        const days = Math.floor((NOW - due) / DAY);
        for (let w = 0; w * 7 <= days; w++) notify(u.id, "OVERDUE", `Khoá ${c.title} đã quá hạn ${w * 7 + 1} ngày`, due + (w * 7 + 1) * DAY - 6 * 3_600_000, `/my-courses/${c.id}`, `overdue:${id}:${dueDay}:w${w}`);
      }
    }
    // Đánh giá: người từng hoàn thành
    if (completedVersion !== null && rng.chance(0.42)) {
      const t = clampNow((completedAt ?? startedAt ?? created) + rng.int(1, 120) * 3_600_000);
      reviews.push({ id: newId(), courseId: c.id, userId: u.id, rating: rng.weighted([[5, 0.4], [4, 0.35], [3, 0.15], [2, 0.06], [1, 0.04]] as const), comment: rng.chance(0.4) ? "Nội dung dễ hiểu, áp dụng được ngay." : null, createdAt: at(t), updatedAt: at(t) });
    }
  }

  for (const u of users) {
    if (u.role === "GROUP_ADMIN") continue;
    const enrolled = new Set<string>();
    const start = Math.max(YEAR_AGO, u.hiredAt);
    const createdFor = (c: Course, earliest: number) => {
      const from = Math.max(start, c.versions[0]?.at ?? c.createdAt, earliest);
      return from >= NOW - DAY ? NOW - 2 * 3_600_000 : between(from, NOW - DAY);
    };
    // 1) Theo lộ trình (quy tắc gắn lộ trình): khoá sau chỉ học khi khoá trước xong
    for (const r of rules.filter((x) => x.pathId && x.isActive && ruleMatches(x, u))) {
      const p = paths.find((x) => x.id === r.pathId)!;
      let blocked = false;
      const created = createdFor(courseById.get(p.courseIds[0])!, r.createdAt);
      for (const cid of p.courseIds) {
        if (enrolled.has(cid)) continue;
        enrolled.add(cid);
        const c = courseById.get(cid)!;
        const before = enrollments.length;
        simulate(u, c, "RULE", { ruleId: r.id, pathId: p.id, dueDays: r.dueInDays, forceNotStarted: blocked, created });
        if (enrollments[before].status !== "COMPLETED") blocked = true;
      }
    }
    // 2) Các khoá còn lại thấy được
    const isFixedLearner = u.code.startsWith("PERF-LN");
    for (const c of visibleCourses(u.companyId)) {
      if (enrolled.has(c.id)) continue;
      const take = isFixedLearner ? (u.code === "PERF-LN1" ? 1 : 0.85) : c.status === "ARCHIVED" ? 0.6 : 0.98;
      if (!rng.chance(take)) continue;
      enrolled.add(c.id);
      const rule = rules.find((r) => r.courseId === c.id && r.isActive && ruleMatches(r, u));
      if (rule) {
        simulate(u, c, "RULE", { ruleId: rule.id, pathId: null, dueDays: rule.dueInDays, forceNotStarted: false, created: createdFor(c, rule.createdAt) });
      } else if (c.allowSelfEnroll && rng.chance(0.35)) {
        simulate(u, c, "SELF", { ruleId: null, pathId: null, dueDays: null, forceNotStarted: false, created: createdFor(c, 0) });
      } else {
        simulate(u, c, "ASSIGNED", { ruleId: null, pathId: null, dueDays: rng.pick([14, 21, 30, 45, 60]), forceNotStarted: false, created: createdFor(c, 0) });
      }
    }
  }

  // Vài lượt làm bài bỏ dở quá giờ (tác vụ hằng ngày sẽ chấm)
  const openEnrollments = enrollments.filter((e) => e.status === "IN_PROGRESS");
  for (const e of rng.sample(openEnrollments, 40 * SCALE)) {
    const c = courseById.get(e.courseId)!;
    const quiz = c.lessons.find((l) => l.type === "QUIZ" && l.maxAttempts === null);
    if (!quiz) continue;
    const version = c.currentVersion;
    const key = `${quiz.id}|${e.userId}|${version}`;
    const used = attemptCount.get(key) ?? 0;
    attemptCount.set(key, used + 1);
    const q = rng.sample(c.questionIds, 5);
    attempts.push({ id: newId(), lessonId: quiz.id, userId: e.userId, courseVersion: version, attemptNo: used + 1, answers: q.map((x) => ({ questionId: x.id, type: x.type, content: x.content, imageUrl: null, explanation: null, options: x.options, selected: [] })), startedAt: at(NOW - rng.int(2, 40) * 3_600_000) });
  }

  // Thông báo nhắc nhở (bù cho đủ ~150k; PERF-LN1 nhận nhiều)
  const targetNotifications = 150_000 * SCALE;
  const activeUsers = users.filter((u) => u.active && u.role !== "GROUP_ADMIN");
  const ln1 = users.find((u) => u.code === "PERF-LN1")!;
  for (let i = 0; i < 500; i++) notify(ln1.id, "REMINDER", "Trưởng phòng nhắc bạn hoàn thành các khoá được giao", between(NOW - 170 * DAY, NOW), "/my-courses");
  while (notifications.length < targetNotifications) {
    const u = rng.pick(activeUsers);
    notify(u.id, "REMINDER", "Bạn có khoá học chưa hoàn thành — vui lòng sắp xếp thời gian học", between(YEAR_AGO, NOW), "/my-courses");
  }

  // ---------------- Nhật ký ----------------
  const audit: Prisma.AuditLogCreateManyInput[] = [];
  for (let d = 0; d < 365; d++) {
    const t = YEAR_AGO + d * DAY + 2 * 3_600_000;
    audit.push({ id: newId(), actorId: null, companyId: null, action: "JOB_DAILY_RUN", entityType: "Job", entityId: "daily", metadata: { trigger: "cron", durationMs: rng.int(800, 4000) }, createdAt: at(t) });
  }
  const admins = [ga, ...companyAdmin.values(), ...editors];
  const actions = [
    ["ENROLLMENTS_ASSIGNED", "Course"], ["USER_UPDATED", "User"], ["USER_CREATED", "User"], ["LESSON_UPDATED", "Lesson"],
    ["COURSE_UPDATED", "Course"], ["QUESTION_UPDATED", "Question"], ["ENROLLMENT_EXTENDED", "Enrollment"], ["USER_PASSWORD_RESET", "User"],
    ["DEPARTMENT_UPDATED", "Department"], ["ASSIGNMENT_RULE_UPDATED", "AssignmentRule"], ["USER_LOCKED", "User"], ["QUESTION_CREATED", "Question"],
  ] as const;
  while (audit.length < 30_000 * SCALE) {
    const a = rng.pick(admins);
    const [action, entityType] = rng.weighted(actions.map((x, i) => [x, i < 4 ? 3 : 1] as const));
    audit.push({ id: newId(), actorId: a.id, companyId: a.companyId, action, entityType, entityId: newId(), metadata: { note: "perf" }, createdAt: at(between(YEAR_AGO, NOW)) });
  }

  // ---------------- Ghi ----------------
  console.log("→ Ghi lượt học, tiến độ, bài làm, chứng nhận, đánh giá, thông báo, nhật ký...");
  await insertMany("enrollments", enrollments, (d) => prisma.enrollment.createMany({ data: d }));
  await insertMany("lesson_progress", progress, (d) => prisma.lessonProgress.createMany({ data: d }));
  await insertMany("quiz_attempts", attempts, (d) => prisma.quizAttempt.createMany({ data: d }));
  await insertMany("certificates", certificates, (d) => prisma.certificate.createMany({ data: d }));
  await insertMany("course_reviews", reviews, (d) => prisma.courseReview.createMany({ data: d }));
  await insertMany("notifications", notifications, (d) => prisma.notification.createMany({ data: d, skipDuplicates: true }));
  await insertMany("audit_logs", audit, (d) => prisma.auditLog.createMany({ data: d }));

  if (EXTREME) await seedExtreme(passwordHash);

  await prisma.$executeRawUnsafe("ANALYZE");
  await report(started, userById.size);
}

/** Dòng cực đoan để rà giao diện (Việc 32) — chạy SAU toàn bộ dữ liệu thường nên không đổi các dòng đã sinh. */
async function seedExtreme(passwordHash: string) {
  console.log("→ Thêm dòng cực đoan (--extreme)...");
  const cty1 = await prisma.company.findUniqueOrThrow({ where: { code: "CTY1" } });
  const mg1 = await prisma.user.findUniqueOrThrow({ where: { employeeCode: "PERF-MG1" } });
  const ln1 = await prisma.user.findUniqueOrThrow({ where: { employeeCode: "PERF-LN1" } });
  const t = at(NOW - 2 * DAY);
  const longName = "Nguyễn Thị Hoàng Phương Thảo Nguyên Bảo Ngọc Minh Châu Khánh Linh Diệu Hương Anh".padEnd(80, " Á").slice(0, 80);
  const longTitle = (
    "Quy trình an toàn vệ sinh lao động, phòng cháy chữa cháy và ứng phó sự cố khẩn cấp tại kho hàng, nhà xưởng, văn phòng " +
    "và các điểm bán lẻ trên toàn hệ thống — cập nhật theo quy định mới nhất năm 2026 (bản đầy đủ)"
  ).slice(0, 200);
  const user = (code: string, fullName: string, extra: Partial<Prisma.UserUncheckedCreateInput> = {}) =>
    prisma.user.create({
      data: { id: newId(), employeeCode: code, fullName, passwordHash, mustChangePassword: false, companyId: cty1.id, departmentId: mg1.departmentId, createdAt: t, updatedAt: t, ...extra },
    });

  const longUser = await user("PERF-X-LONG", longName, { email: "nguyen.thi.hoang.phuong.thao.nguyen.bao.ngoc@congty-thanh-vien-1.example.vn" });
  await user("PERF-X-NOCOURSE", "Học viên Chưa Có Khoá");

  // Phòng ban 5 cấp (cấp 1 nằm dưới phòng của PERF-MG1), trưởng phòng cấp 1 = PERF-X-MG
  const xmg = await user("PERF-X-MG", "Trưởng phòng Cây Năm Cấp", { role: "MANAGER" });
  let parentId = mg1.departmentId;
  for (let level = 1; level <= 5; level++) {
    const d = await prisma.department.create({
      data: { id: newId(), companyId: cty1.id, parentId, code: `XL${level}`, name: `Phòng ban cấp ${level} — Bộ phận nghiệp vụ chuyên sâu số ${level}`, managerId: level === 1 ? xmg.id : null, createdAt: t, updatedAt: t },
    });
    parentId = d.id;
  }
  await user("PERF-X-DEEP", "Nhân viên Phòng Cấp Năm", { departmentId: parentId });

  // Khoá tên 200 ký tự (đã phát hành, cho tự đăng ký) + khoá nháp 0 bài
  const long = await prisma.course.create({
    data: {
      id: newId(), ownerCompanyId: cty1.id, code: "PERF-X-LONG-COURSE", title: longTitle, status: "PUBLISHED", currentVersion: 1, allowSelfEnroll: true,
      description: longTitle.repeat(3), createdAt: t, updatedAt: t,
      versions: { create: { versionNo: 1, changeType: "INITIAL", status: "PUBLISHED", publishedAt: t } },
      sections: { create: { title: `Chương có tên rất dài: ${longTitle}`, lessons: { create: { type: "DOCUMENT", title: `Bài học có tên rất dài: ${longTitle}`, content: "<p>Nội dung</p>" } } } },
    },
  });
  await prisma.course.create({ data: { id: newId(), ownerCompanyId: cty1.id, code: "PERF-X-EMPTY", title: "Khoá nháp chưa có bài nào", status: "DRAFT", currentVersion: 0, createdAt: t, updatedAt: t } });
  for (const u of [longUser, ln1]) {
    await prisma.enrollment.create({ data: { id: newId(), userId: u.id, courseId: long.id, source: "ASSIGNED", dueDate: dueOf(NOW, 7), createdAt: t, updatedAt: t } });
  }

  // Thông báo rất dài
  const longNote = `Trưởng phòng ${longName} nhắc bạn hoàn thành khoá ${longTitle} — ${"Vui lòng hoàn thành trước hạn để không ảnh hưởng tới đánh giá cuối kỳ. ".repeat(4)}`;
  await prisma.notification.createMany({
    data: [longUser, ln1].map((u) => ({ id: newId(), userId: u.id, type: "REMINDER", title: longNote, link: `/my-courses/${long.id}`, createdAt: at(NOW - 3_600_000) })),
  });
}

async function report(started: number, nUsers: number) {
  const tables = await prisma.$queryRaw<{ table: string; rows: number }[]>`
    SELECT relname AS "table", n_live_tup::int AS rows FROM pg_stat_user_tables WHERE relname <> '_prisma_migrations' ORDER BY n_live_tup DESC`;
  // Đếm chính xác (pg_stat có thể trễ)
  const exact: { table: string; rows: number }[] = [];
  for (const t of tables) {
    const r = await prisma.$queryRawUnsafe<{ n: number }[]>(`SELECT COUNT(*)::int AS n FROM "${t.table}"`);
    exact.push({ table: t.table, rows: r[0].n });
  }
  console.log("\nSố dòng từng bảng:");
  console.table(exact.sort((a, b) => b.rows - a.rows));

  // Kiểm tra bất biến
  const checks: [string, string][] = [
    ["COMPLETED nhưng progressPercent ≠ 100", `SELECT COUNT(*)::int n FROM enrollments WHERE status='COMPLETED' AND "progressPercent"<>100`],
    ["completedVersion > acknowledgedVersion", `SELECT COUNT(*)::int n FROM enrollments WHERE "completedVersion" > "acknowledgedVersion"`],
    ["acknowledgedVersion > currentVersion", `SELECT COUNT(*)::int n FROM enrollments e JOIN courses c ON c.id=e."courseId" WHERE e."acknowledgedVersion" > c."currentVersion"`],
    ["Lượt học khoá công ty con của người công ty khác", `SELECT COUNT(*)::int n FROM enrollments e JOIN courses c ON c.id=e."courseId" JOIN users u ON u.id=e."userId" JOIN companies co ON co.id=c."ownerCompanyId" WHERE co."parentId" IS NOT NULL AND u."companyId"<>c."ownerCompanyId"`],
    ["Lượt học khoá DRAFT", `SELECT COUNT(*)::int n FROM enrollments e JOIN courses c ON c.id=e."courseId" WHERE c.status='DRAFT'`],
    ["progressPercent ≠ bài xong ÷ tổng bài", `SELECT COUNT(*)::int n FROM enrollments e JOIN LATERAL (SELECT COUNT(*) t, COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM lesson_progress p WHERE p."lessonId"=l.id AND p."userId"=e."userId" AND p."isCompleted")) d FROM lessons l JOIN course_sections s ON s.id=l."sectionId" WHERE s."courseId"=e."courseId") x ON true WHERE e.status<>'CANCELLED' AND e."progressPercent"<>ROUND(x.d*100.0/x.t)`],
    ["Chứng nhận của người chưa từng hoàn thành", `SELECT COUNT(*)::int n FROM certificates ct LEFT JOIN enrollments e ON e."userId"=ct."userId" AND e."courseId"=ct."courseId" WHERE e."completedVersion" IS NULL`],
    ["Lượt làm bài vượt maxAttempts", `SELECT COUNT(*)::int n FROM quiz_attempts q JOIN lessons l ON l.id=q."lessonId" WHERE l."maxAttempts" IS NOT NULL AND q."attemptNo" > l."maxAttempts"`],
    ["Đánh giá của người chưa từng hoàn thành", `SELECT COUNT(*)::int n FROM course_reviews r LEFT JOIN enrollments e ON e."userId"=r."userId" AND e."courseId"=r."courseId" WHERE e."completedVersion" IS NULL`],
    ["Quy tắc công ty con nhắm công ty khác", `SELECT COUNT(*)::int n FROM assignment_rules r JOIN companies c ON c.id=r."ownerCompanyId" WHERE c."parentId" IS NOT NULL AND r."targetCompanyId" IS DISTINCT FROM r."ownerCompanyId"`],
  ];
  console.log("\nKiểm tra bất biến (phải = 0):");
  let bad = 0;
  for (const [label, sql] of checks) {
    const r = await prisma.$queryRawUnsafe<{ n: number }[]>(sql);
    bad += r[0].n;
    console.log(`  ${r[0].n === 0 ? "✔" : "✘"} ${label}: ${r[0].n}`);
  }
  const [overdue] = await prisma.$queryRaw<{ n: number; total: number }[]>`
    SELECT COUNT(*) FILTER (WHERE "dueDate" < ${new Date(NOW)} AND status IN ('NOT_STARTED','IN_PROGRESS'))::int n, COUNT(*)::int total FROM enrollments`;
  const [mg1] = await prisma.$queryRaw<{ n: number }[]>`
    WITH RECURSIVE t AS (SELECT id FROM departments WHERE "managerId" = (SELECT id FROM users WHERE "employeeCode"='PERF-MG1')
      UNION SELECT d.id FROM departments d JOIN t ON d."parentId" = t.id)
    SELECT COUNT(*)::int n FROM users WHERE "departmentId" IN (SELECT id FROM t) AND status='ACTIVE'`;
  const [ln1] = await prisma.$queryRaw<{ e: number; n: number }[]>`
    SELECT (SELECT COUNT(*)::int FROM enrollments WHERE "userId"=u.id) e, (SELECT COUNT(*)::int FROM notifications WHERE "userId"=u.id) n FROM users u WHERE "employeeCode"='PERF-LN1'`;
  console.log(`\nQuá hạn: ${overdue.n} / ${overdue.total} lượt (${((overdue.n / overdue.total) * 100).toFixed(1)}%) · PERF-MG1 quản lý ${mg1.n} người · PERF-LN1: ${ln1.e} lượt học, ${ln1.n} thông báo · ${nUsers} người`);
  console.log(`\n${bad === 0 ? "✔" : "✘"} Xong sau ${((Date.now() - started) / 1000).toFixed(1)} giây. Mật khẩu mọi tài khoản: ${PASSWORD}`);
  if (bad) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error("✘ Lỗi:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
