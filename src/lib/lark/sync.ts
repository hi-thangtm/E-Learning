import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { onUserOrgChanged } from "@/lib/assignment";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { vnIsoDate } from "@/lib/format";
import { EMAIL_MAX, EMPLOYEE_CODE_REGEX, FULL_NAME_MAX, FULL_NAME_MIN, PHONE_REGEX, fromDbDate, isValidEmail, toDbDate } from "@/lib/user-rules";
import { fetchLarkDirectory, type LarkDirectory } from "./directory";

/**
 * Đồng bộ Lark → E-Learning (Việc L1, docs/database.md — Quy tắc 5 “Đồng bộ Lark”).
 * - computeLarkPlan: lõi THUẦN (không I/O) — tính toàn bộ thay đổi từ danh bạ Lark + ảnh chụp database.
 * - planLarkSync: đọc Lark + database rồi gọi lõi (chạy thử).
 * - applyLarkSync: ghi kế hoạch trong 1 transaction + khoá advisory, 1 dòng audit LARK_SYNC_RUN, rồi chạy quy tắc giao (onUserOrgChanged).
 * Lark là nguồn chính cho: họ tên, email, điện thoại, phòng ban, công ty, ngày vào làm, nghỉ việc, trưởng phòng. KHÔNG đồng bộ vai trò, chức danh.
 */

const LOCK_KEY = 20_260_101;
/** Chốt chặn khoá hàng loạt: > 5% người đang hoạt động hoặc > 20 người */
const GUARD_RATIO = 0.05;
const GUARD_MAX = 20;
const AUDIT_CHANGE_LIMIT = 500;

// ---------------------------------------------------------------------------------------------
// Ảnh chụp database

export type DbCompany = { id: string; code: string; name: string; larkDepartmentId: string | null };
export type DbDepartment = { id: string; companyId: string; code: string; name: string; parentId: string | null; managerId: string | null; isActive: boolean; larkDepartmentId: string | null };
export type DbUser = {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hireDate: string | null;
  companyId: string;
  departmentId: string | null;
  role: Role;
  status: "ACTIVE" | "INACTIVE";
  inactiveSource: string | null;
  larkUserId: string | null;
};
export type DbSnapshot = { companies: DbCompany[]; departments: DbDepartment[]; users: DbUser[] };

// ---------------------------------------------------------------------------------------------
// Kế hoạch

export type FieldChange = { field: "fullName" | "email" | "phone" | "hireDate" | "company" | "department" | "larkUserId" | "status"; from: string | null; to: string | null };

export type DeptPlan = {
  kind: "create" | "adopt" | "update" | "deactivate";
  larkId: string | null;
  /** id phòng đã có (adopt / update / deactivate) */
  id: string | null;
  companyId: string;
  companyCode: string;
  code: string;
  name: string;
  /** larkId phòng cha trong cùng công ty (null = phòng cấp 1) — chỉ create / adopt / update */
  parentLarkId: string | null;
  /** Gỡ larkDepartmentId (phòng chuyển sang nhánh công ty khác) */
  clearLarkId?: boolean;
  changes: string[];
  depth: number;
};

export type UserPlan = {
  kind: "create" | "update" | "transfer" | "lock" | "reopen";
  larkUserId: string | null;
  /** id tài khoản đã có (không có khi create) */
  id: string | null;
  employeeCode: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  hireDate: string | null;
  companyId: string;
  companyCode: string;
  fromCompanyId: string | null;
  fromCompanyCode: string | null;
  /** Phòng ban sau đồng bộ: larkId (null = cấp công ty / giữ nguyên nếu keepDepartment) */
  departmentLarkId: string | null;
  departmentName: string | null;
  keepDepartment: boolean;
  orgChanged: boolean;
  changes: FieldChange[];
  reason?: string;
};

export type ManagerPlan = {
  departmentLarkId: string;
  departmentName: string;
  companyCode: string;
  /** null = gỡ trưởng phòng */
  larkUserId: string | null;
  userId: string | null;
  employeeCode: string | null;
  fullName: string | null;
  promote: boolean;
};

export type SkipItem = { larkUserId: string | null; employeeCode: string | null; fullName: string; reason: string };
export type LocalOnly = { id: string; employeeCode: string; fullName: string; companyCode: string; status: string };

export type LarkPlan = {
  departments: DeptPlan[];
  users: UserPlan[];
  managers: ManagerPlan[];
  skipped: SkipItem[];
  localOnly: LocalOnly[];
  warnings: string[];
  counts: {
    create: number;
    update: number;
    transfer: number;
    lock: number;
    reopen: number;
    skipped: number;
    localOnly: number;
    departments: number;
    managers: number;
  };
  guard: { lock: number; active: number; tripped: boolean; limit: number };
  larkUsers: number;
  larkDepartments: number;
  fingerprint: string;
};

// ---------------------------------------------------------------------------------------------
// Chuẩn hoá dữ liệu Lark

const norm = (s: string) => s.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase();

/** +84 912 345 678 → 0912345678; số nước ngoài giữ “+…”; sai định dạng → null */
export function normalizePhone(raw: string | null): string | null {
  if (!raw) return null;
  let p = raw.replace(/[\s.()-]/g, "");
  if (p.startsWith("+84")) p = `0${p.slice(3)}`;
  else if (p.startsWith("0084")) p = `0${p.slice(4)}`;
  return PHONE_REGEX.test(p) ? p : null;
}

function normalizeEmail(raw: string | null): string | null {
  if (!raw) return null;
  const e = raw.trim();
  return e.length <= EMAIL_MAX && isValidEmail(e) ? e : null;
}

const joinDate = (unixSeconds: number | null) => (unixSeconds ? vnIsoDate(new Date(unixSeconds * 1000)) : null);

/** Mã phòng ổn định từ open_department_id: LK- + hash (dài thêm nếu trùng trong công ty) */
function deptCode(openId: string, taken: Set<string>): string {
  const hash = createHash("sha1").update(openId).digest("hex").toUpperCase();
  for (let len = 6; len <= 16; len += 2) {
    const code = `LK-${hash.slice(0, len)}`;
    if (!taken.has(code)) return code;
  }
  return `LK-${hash.slice(0, 17)}`;
}

// ---------------------------------------------------------------------------------------------
// Lõi thuần

export function computeLarkPlan(lark: LarkDirectory, db: DbSnapshot): LarkPlan {
  const warnings: string[] = [];
  const skipped: SkipItem[] = [];
  const companyById = new Map(db.companies.map((c) => [c.id, c]));
  const companyByLarkRoot = new Map(db.companies.filter((c) => c.larkDepartmentId).map((c) => [c.larkDepartmentId!, c]));
  const larkDept = new Map(lark.departments.map((d) => [d.openId, d]));

  // Công ty của 1 phòng Lark = công ty có larkDepartmentId là tổ tiên gần nhất (tính cả chính nó)
  const companyOfCache = new Map<string, DbCompany | null>();
  const companyOf = (openId: string): DbCompany | null => {
    if (companyOfCache.has(openId)) return companyOfCache.get(openId)!;
    let cur: string | undefined = openId;
    let found: DbCompany | null = null;
    for (let guard = 0; cur && cur !== "0" && guard < 100; guard++) {
      const c = companyByLarkRoot.get(cur);
      if (c) {
        found = c;
        break;
      }
      cur = larkDept.get(cur)?.parentOpenId;
    }
    companyOfCache.set(openId, found);
    return found;
  };
  for (const c of db.companies) if (c.larkDepartmentId && !larkDept.has(c.larkDepartmentId)) warnings.push(`Phòng ban Lark ghép với công ty ${c.code} không còn trên Lark.`);

  // ---------------- Phòng ban ----------------
  // Phòng cần đồng bộ = nằm DƯỚI 1 phòng gốc đã ghép (phòng gốc = cấp công ty, không tạo phòng)
  const synced = lark.departments.filter((d) => !companyByLarkRoot.has(d.openId) && companyOf(d.openId));
  const parentInCompany = (openId: string): string | null => {
    const p = larkDept.get(openId)!.parentOpenId;
    return companyByLarkRoot.has(p) ? null : p;
  };
  const depthOf = (openId: string): number => {
    let n = 0;
    for (let p = parentInCompany(openId); p; p = parentInCompany(p)) n++;
    return n;
  };
  synced.sort((a, b) => depthOf(a.openId) - depthOf(b.openId));

  const dbDeptByLark = new Map(db.departments.filter((d) => d.larkDepartmentId).map((d) => [d.larkDepartmentId!, d]));
  const dbDeptById = new Map(db.departments.map((d) => [d.id, d]));
  const codesTaken = new Map<string, Set<string>>(); // companyId → mã đã dùng
  for (const d of db.departments) codesTaken.set(d.companyId, new Set([...(codesTaken.get(d.companyId) ?? []), d.code]));
  const adoptedIds = new Set<string>();
  /** larkId → id phòng đã có (sau ghép) — dùng để so phòng cha khi ghép theo tên */
  const resolvedId = new Map<string, string>();
  const deptPlans: DeptPlan[] = [];
  /** larkId → { companyId, name } của mọi phòng đồng bộ (kể cả không đổi) */
  const syncedInfo = new Map<string, { companyId: string; name: string; dbId: string | null }>();

  for (const d of synced) {
    const company = companyOf(d.openId)!;
    const parentLark = parentInCompany(d.openId);
    const parentDbId = parentLark ? (resolvedId.get(parentLark) ?? null) : null;
    const depth = depthOf(d.openId);
    let existing = dbDeptByLark.get(d.openId) ?? null;

    if (existing && existing.companyId !== company.id) {
      // Phòng chuyển sang nhánh công ty khác → phòng cũ thôi gắn Lark (ngừng hoạt động nếu trống), tạo phòng mới ở công ty mới
      warnings.push(`Phòng “${d.name}” chuyển từ công ty ${companyById.get(existing.companyId)?.code} sang ${company.code} trên Lark — tạo phòng mới ở ${company.code}.`);
      deptPlans.push({ kind: "deactivate", larkId: d.openId, id: existing.id, companyId: existing.companyId, companyCode: companyById.get(existing.companyId)?.code ?? "?", code: existing.code, name: existing.name, parentLarkId: null, clearLarkId: true, changes: ["Chuyển công ty trên Lark"], depth });
      existing = null;
    }
    if (!existing) {
      // Lần đầu: ghép phòng có sẵn chưa gắn Lark trùng tên (cùng công ty, cùng phòng cha)
      const candidate = db.departments.find(
        (x) =>
          !x.larkDepartmentId &&
          !adoptedIds.has(x.id) &&
          x.companyId === company.id &&
          norm(x.name) === norm(d.name) &&
          (x.parentId ?? null) === parentDbId &&
          (parentLark === null || parentDbId !== null),
      );
      if (candidate) {
        adoptedIds.add(candidate.id);
        resolvedId.set(d.openId, candidate.id);
        const changes = [`Ghép phòng có sẵn ${candidate.code}`];
        if (candidate.name !== d.name) changes.push(`Tên: ${candidate.name} → ${d.name}`);
        if (!candidate.isActive) changes.push("Hoạt động lại");
        deptPlans.push({ kind: "adopt", larkId: d.openId, id: candidate.id, companyId: company.id, companyCode: company.code, code: candidate.code, name: d.name, parentLarkId: parentLark, changes, depth });
        syncedInfo.set(d.openId, { companyId: company.id, name: d.name, dbId: candidate.id });
        continue;
      }
      const taken = codesTaken.get(company.id) ?? new Set<string>();
      const code = deptCode(d.openId, taken);
      taken.add(code);
      codesTaken.set(company.id, taken);
      deptPlans.push({ kind: "create", larkId: d.openId, id: null, companyId: company.id, companyCode: company.code, code, name: d.name, parentLarkId: parentLark, changes: [], depth });
      syncedInfo.set(d.openId, { companyId: company.id, name: d.name, dbId: null });
      continue;
    }
    resolvedId.set(d.openId, existing.id);
    syncedInfo.set(d.openId, { companyId: company.id, name: d.name, dbId: existing.id });
    const changes: string[] = [];
    if (existing.name !== d.name) changes.push(`Tên: ${existing.name} → ${d.name}`);
    const wantParentKnown = parentLark === null || parentDbId !== null;
    if (wantParentKnown && (existing.parentId ?? null) !== parentDbId) changes.push("Đổi phòng cha");
    if (!wantParentKnown) changes.push("Đổi phòng cha (phòng cha mới)");
    if (!existing.isActive) changes.push("Hoạt động lại");
    if (changes.length) deptPlans.push({ kind: "update", larkId: d.openId, id: existing.id, companyId: company.id, companyCode: company.code, code: existing.code, name: d.name, parentLarkId: parentLark, changes, depth });
  }

  // ---------------- Nhân viên ----------------
  const dbByLark = new Map(db.users.filter((u) => u.larkUserId).map((u) => [u.larkUserId!, u]));
  const dbByCode = new Map(db.users.map((u) => [u.employeeCode, u]));
  const larkByCode = new Map<string, number>();
  for (const u of lark.users) if (u.employeeNo) larkByCode.set(u.employeeNo.toUpperCase(), (larkByCode.get(u.employeeNo.toUpperCase()) ?? 0) + 1);
  const matchedDbIds = new Set<string>();
  const userPlans: UserPlan[] = [];
  /** Lark user_id → kết quả sau đồng bộ (để gán trưởng phòng) */
  const finalByLark = new Map<string, { id: string | null; employeeCode: string; fullName: string; companyId: string; active: boolean; role: Role }>();
  const larkDeptCount = new Map<string, number>(); // larkId phòng → số người hoạt động sau đồng bộ

  for (const lu of lark.users) {
    const code = lu.employeeNo?.toUpperCase() ?? null;
    let existing = dbByLark.get(lu.userId) ?? null;
    if (!existing) {
      if (!code) {
        skipped.push({ larkUserId: lu.userId, employeeCode: null, fullName: lu.name, reason: "Thiếu mã nhân viên (employee_no) trên Lark" });
        continue;
      }
      if ((larkByCode.get(code) ?? 0) > 1) {
        skipped.push({ larkUserId: lu.userId, employeeCode: code, fullName: lu.name, reason: "Trùng mã nhân viên với người khác trên Lark" });
        continue;
      }
      const byCode = dbByCode.get(code);
      if (byCode?.larkUserId && byCode.larkUserId !== lu.userId) {
        skipped.push({ larkUserId: lu.userId, employeeCode: code, fullName: lu.name, reason: "Mã nhân viên trùng tài khoản đã gắn người Lark khác" });
        continue;
      }
      existing = byCode ?? null;
    }

    // Công ty + phòng chính
    const inBranch = lu.departmentIds.filter((id) => id !== "0" && companyOf(id));
    const primary = lu.primaryDepartmentId && inBranch.includes(lu.primaryDepartmentId) ? lu.primaryDepartmentId : (inBranch[0] ?? null);
    if (!primary) {
      if (existing) matchedDbIds.add(existing.id);
      skipped.push({ larkUserId: lu.userId, employeeCode: code ?? existing?.employeeCode ?? null, fullName: lu.name, reason: "Không thuộc nhánh phòng ban nào đã ghép với công ty" });
      continue;
    }
    const company = companyOf(primary)!;
    const deptLark = companyByLarkRoot.has(primary) ? null : primary;
    const deptName = deptLark ? (syncedInfo.get(deptLark)?.name ?? null) : null;

    const name = lu.name.normalize("NFC").trim().slice(0, FULL_NAME_MAX);
    const email = normalizeEmail(lu.email);
    if (lu.email && !email) warnings.push(`Email Lark không hợp lệ của ${code ?? lu.userId}: bỏ trống email.`);
    const phone = normalizePhone(lu.mobile);
    const hireDate = joinDate(lu.joinTime);

    if (!existing) {
      if (lu.inactive) {
        skipped.push({ larkUserId: lu.userId, employeeCode: code, fullName: lu.name, reason: "Đã nghỉ việc / đóng băng trên Lark, chưa có tài khoản" });
        continue;
      }
      if (!code || !EMPLOYEE_CODE_REGEX.test(code)) {
        skipped.push({ larkUserId: lu.userId, employeeCode: code, fullName: lu.name, reason: "Mã nhân viên Lark sai định dạng (chữ in hoa, số, . _ -, 2–30 ký tự)" });
        continue;
      }
      if (name.length < FULL_NAME_MIN) {
        skipped.push({ larkUserId: lu.userId, employeeCode: code, fullName: lu.name, reason: "Thiếu họ tên trên Lark" });
        continue;
      }
      userPlans.push({
        kind: "create", larkUserId: lu.userId, id: null, employeeCode: code, fullName: name, email, phone, hireDate,
        companyId: company.id, companyCode: company.code, fromCompanyId: null, fromCompanyCode: null,
        departmentLarkId: deptLark, departmentName: deptName, keepDepartment: false, orgChanged: true, changes: [],
      });
      finalByLark.set(lu.userId, { id: null, employeeCode: code, fullName: name, companyId: company.id, active: true, role: "LEARNER" });
      if (deptLark) larkDeptCount.set(deptLark, (larkDeptCount.get(deptLark) ?? 0) + 1);
      continue;
    }

    matchedDbIds.add(existing.id);
    const changes: FieldChange[] = [];
    if (!existing.larkUserId) changes.push({ field: "larkUserId", from: null, to: lu.userId });
    const newName = name.length >= FULL_NAME_MIN ? name : existing.fullName;
    if (newName !== existing.fullName) changes.push({ field: "fullName", from: existing.fullName, to: newName });
    if ((email ?? null) !== (existing.email ?? null)) changes.push({ field: "email", from: existing.email, to: email });
    if ((phone ?? null) !== (existing.phone ?? null)) changes.push({ field: "phone", from: existing.phone, to: phone });
    const newHire = hireDate ?? existing.hireDate;
    if (newHire !== existing.hireDate) changes.push({ field: "hireDate", from: existing.hireDate, to: newHire });

    let targetCompany = company;
    let transfer = existing.companyId !== company.id;
    if (transfer && existing.role === "GROUP_ADMIN") {
      warnings.push(`${existing.employeeCode} là Admin tập đoàn — không tự chuyển công ty theo Lark (đang ở nhánh ${company.code}).`);
      transfer = false;
      targetCompany = companyById.get(existing.companyId)!;
    }
    const keepDepartment = !transfer && targetCompany.id !== company.id;
    const existingDeptLark = existing.departmentId ? (dbDeptById.get(existing.departmentId)?.larkDepartmentId ?? null) : null;
    const existingDeptResolved = existing.departmentId;
    const targetDeptId = deptLark ? (syncedInfo.get(deptLark)?.dbId ?? null) : null;
    const deptChanged = !keepDepartment && (deptLark ? targetDeptId === null || targetDeptId !== existingDeptResolved : existingDeptResolved !== null);
    if (transfer) changes.push({ field: "company", from: companyById.get(existing.companyId)?.code ?? null, to: company.code });
    if (deptChanged) changes.push({ field: "department", from: existingDeptResolved ? (dbDeptById.get(existingDeptResolved)?.name ?? existingDeptLark) : null, to: deptName });

    let kind: UserPlan["kind"] | null = null;
    let reason: string | undefined;
    let active = existing.status === "ACTIVE";
    if (lu.inactive && existing.status === "ACTIVE") {
      kind = "lock";
      reason = "Nghỉ việc / đóng băng trên Lark";
      active = false;
      changes.push({ field: "status", from: "Đang làm", to: "Khoá (Lark)" });
    } else if (!lu.inactive && existing.status === "INACTIVE") {
      if (existing.inactiveSource === "LARK") {
        kind = "reopen";
        active = true;
        changes.push({ field: "status", from: "Khoá (Lark)", to: "Đang làm" });
      } else {
        // Khoá do Admin (hoặc khoá từ trước khi có Lark): không tự mở, không đổi gì — chỉ báo cáo
        skipped.push({ larkUserId: lu.userId, employeeCode: existing.employeeCode, fullName: existing.fullName, reason: "Đang làm trên Lark nhưng tài khoản bị Admin khoá — không tự mở" });
        finalByLark.set(lu.userId, { id: existing.id, employeeCode: existing.employeeCode, fullName: existing.fullName, companyId: existing.companyId, active: false, role: existing.role });
        continue;
      }
    }
    if (!kind && transfer) kind = "transfer";
    if (!kind && changes.length > 0) kind = "update";
    if (kind) {
      userPlans.push({
        kind, larkUserId: lu.userId, id: existing.id, employeeCode: existing.employeeCode, fullName: newName, email, phone, hireDate: newHire,
        companyId: targetCompany.id, companyCode: targetCompany.code, fromCompanyId: transfer ? existing.companyId : null,
        fromCompanyCode: transfer ? (companyById.get(existing.companyId)?.code ?? null) : null,
        departmentLarkId: deptLark, departmentName: deptName, keepDepartment, orgChanged: transfer || deptChanged || kind === "reopen", changes, reason,
      });
    }
    finalByLark.set(lu.userId, { id: existing.id, employeeCode: existing.employeeCode, fullName: newName, companyId: targetCompany.id, active, role: existing.role });
    if (active && deptLark && !keepDepartment) larkDeptCount.set(deptLark, (larkDeptCount.get(deptLark) ?? 0) + 1);
  }

  // Đã gắn Lark nhưng không còn trên Lark → khoá
  const larkIds = new Set(lark.users.map((u) => u.userId));
  for (const u of db.users) {
    if (!u.larkUserId || larkIds.has(u.larkUserId)) continue;
    matchedDbIds.add(u.id);
    if (u.status !== "ACTIVE") continue;
    userPlans.push({
      kind: "lock", larkUserId: u.larkUserId, id: u.id, employeeCode: u.employeeCode, fullName: u.fullName, email: u.email, phone: u.phone, hireDate: u.hireDate,
      companyId: u.companyId, companyCode: companyById.get(u.companyId)?.code ?? "?", fromCompanyId: null, fromCompanyCode: null,
      departmentLarkId: null, departmentName: null, keepDepartment: true, orgChanged: false,
      changes: [{ field: "status", from: "Đang làm", to: "Khoá (Lark)" }], reason: "Không còn trên Lark",
    });
  }
  const localOnly: LocalOnly[] = db.users
    .filter((u) => !u.larkUserId && !matchedDbIds.has(u.id))
    .map((u) => ({ id: u.id, employeeCode: u.employeeCode, fullName: u.fullName, companyCode: companyById.get(u.companyId)?.code ?? "?", status: u.status }));

  // Phòng không còn trên Lark (hoặc ra khỏi nhánh đã ghép) → ngừng hoạt động nếu không còn người / phòng con đang dùng
  const syncedLark = new Set(synced.map((d) => d.openId));
  const stillUsedByUsers = (deptId: string) =>
    db.users.some((u) => u.status === "ACTIVE" && u.departmentId === deptId && !userPlans.some((p) => p.id === u.id && (p.kind === "lock" || !p.keepDepartment)));
  for (const d of db.departments) {
    if (!d.larkDepartmentId || syncedLark.has(d.larkDepartmentId) || !d.isActive) continue;
    if (deptPlans.some((p) => p.id === d.id)) continue;
    const activeChildren = db.departments.some((x) => x.parentId === d.id && x.isActive && !(x.larkDepartmentId && !syncedLark.has(x.larkDepartmentId)));
    if (stillUsedByUsers(d.id) || activeChildren) {
      warnings.push(`Phòng ${d.code} — ${d.name} không còn trên Lark nhưng vẫn còn người / phòng con đang dùng: giữ nguyên.`);
      continue;
    }
    deptPlans.push({ kind: "deactivate", larkId: d.larkDepartmentId, id: d.id, companyId: d.companyId, companyCode: companyById.get(d.companyId)?.code ?? "?", code: d.code, name: d.name, parentLarkId: null, changes: ["Không còn trên Lark"], depth: 99 });
  }
  void larkDeptCount;

  // ---------------- Trưởng phòng ----------------
  const managers: ManagerPlan[] = [];
  for (const d of synced) {
    const info = syncedInfo.get(d.openId)!;
    const current = info.dbId ? (dbDeptById.get(info.dbId)?.managerId ?? null) : null;
    const companyCode = companyById.get(info.companyId)?.code ?? "?";
    if (!d.leaderUserId) {
      if (current) managers.push({ departmentLarkId: d.openId, departmentName: d.name, companyCode, larkUserId: null, userId: null, employeeCode: null, fullName: null, promote: false });
      continue;
    }
    const leader = finalByLark.get(d.leaderUserId);
    if (!leader || !leader.active || leader.companyId !== info.companyId) {
      warnings.push(`Trưởng phòng Lark của “${d.name}” ${!leader ? "chưa có tài khoản / bị bỏ qua" : !leader.active ? "đã nghỉ việc" : "thuộc công ty khác"} — giữ nguyên trưởng phòng hiện tại.`);
      continue;
    }
    if (leader.id && leader.id === current) continue;
    managers.push({
      departmentLarkId: d.openId, departmentName: d.name, companyCode, larkUserId: d.leaderUserId, userId: leader.id, employeeCode: leader.employeeCode,
      fullName: leader.fullName, promote: leader.role === "LEARNER",
    });
  }

  // ---------------- Tổng hợp + chốt chặn ----------------
  const count = (k: UserPlan["kind"]) => userPlans.filter((u) => u.kind === k).length;
  const active = db.users.filter((u) => u.status === "ACTIVE").length;
  const lock = count("lock");
  const limit = Math.min(GUARD_MAX, Math.floor(active * GUARD_RATIO));
  const plan: Omit<LarkPlan, "fingerprint"> = {
    departments: deptPlans,
    users: userPlans,
    managers,
    skipped,
    localOnly,
    warnings,
    counts: {
      create: count("create"), update: count("update"), transfer: count("transfer"), lock, reopen: count("reopen"),
      skipped: skipped.length, localOnly: localOnly.length, departments: deptPlans.length, managers: managers.length,
    },
    guard: { lock, active, tripped: lock > GUARD_MAX || lock > active * GUARD_RATIO, limit },
    larkUsers: lark.users.length,
    larkDepartments: lark.departments.length,
  };
  return { ...plan, fingerprint: fingerprintOf(plan) };
}

/** Dấu vân tay kế hoạch (chỉ các thay đổi sẽ ghi) — nút Áp dụng phải gửi đúng dấu của lần chạy thử. */
function fingerprintOf(plan: Pick<LarkPlan, "departments" | "users" | "managers">): string {
  const body = JSON.stringify({
    d: plan.departments.map((d) => [d.kind, d.larkId, d.id, d.code, d.name, d.parentLarkId, d.companyId, d.clearLarkId ?? false]),
    u: plan.users.map((u) => [u.kind, u.larkUserId, u.id, u.employeeCode, u.fullName, u.email, u.phone, u.hireDate, u.companyId, u.departmentLarkId, u.keepDepartment]),
    m: plan.managers.map((m) => [m.departmentLarkId, m.larkUserId, m.userId]),
  });
  return createHash("sha256").update(body).digest("hex").slice(0, 32);
}

// ---------------------------------------------------------------------------------------------
// Đọc database + Lark

async function loadSnapshot(): Promise<DbSnapshot> {
  const [companies, departments, users] = await Promise.all([
    prisma.company.findMany({ select: { id: true, code: true, name: true, larkDepartmentId: true } }),
    prisma.department.findMany({ select: { id: true, companyId: true, code: true, name: true, parentId: true, managerId: true, isActive: true, larkDepartmentId: true } }),
    prisma.user.findMany({
      select: { id: true, employeeCode: true, fullName: true, email: true, phone: true, hireDate: true, companyId: true, departmentId: true, role: true, status: true, inactiveSource: true, larkUserId: true },
    }),
  ]);
  return { companies, departments, users: users.map((u) => ({ ...u, hireDate: fromDbDate(u.hireDate) })) };
}

/** Chạy thử: đọc Lark + database, tính kế hoạch (không ghi gì). */
export async function planLarkSync(): Promise<LarkPlan> {
  const [lark, db] = await Promise.all([fetchLarkDirectory(), loadSnapshot()]);
  return computeLarkPlan(lark, db);
}

/** Đã có ít nhất 1 lần áp dụng thủ công (điều kiện để tác vụ hằng ngày tự đồng bộ). */
export async function hasManualLarkApply(): Promise<boolean> {
  const row = await prisma.auditLog.findFirst({
    where: { action: "LARK_SYNC_RUN", AND: [{ metadata: { path: ["trigger"], equals: "manual" } }, { metadata: { path: ["applied"], equals: true } }] },
    select: { id: true },
  });
  return !!row;
}

// ---------------------------------------------------------------------------------------------
// Áp dụng

export type LarkSyncTrigger = "manual" | "cron" | "script";
export type ApplyResult = { ok: true; counts: LarkPlan["counts"]; durationMs: number } | { ok: false; message: string };

const FIELD_TEXT: Record<FieldChange["field"], string> = {
  fullName: "họ tên", email: "email", phone: "điện thoại", hireDate: "ngày vào làm", company: "công ty", department: "phòng ban", larkUserId: "liên kết Lark", status: "trạng thái",
};
const KIND_TEXT: Record<UserPlan["kind"], string> = { create: "Tạo", update: "Cập nhật", transfer: "Chuyển công ty", lock: "Khoá", reopen: "Mở lại" };

/** Danh sách thay đổi gọn cho audit (tối đa 500 dòng). */
function changeList(plan: LarkPlan): { type: string; label: string }[] {
  const out: { type: string; label: string }[] = [];
  for (const d of plan.departments) out.push({ type: `DEPT_${d.kind.toUpperCase()}`, label: `${d.companyCode} · ${d.code} — ${d.name}${d.changes.length ? ` (${d.changes.join("; ")})` : ""}` });
  for (const u of plan.users) {
    const fields = u.changes.map((c) => FIELD_TEXT[c.field]).join(", ");
    out.push({ type: `USER_${u.kind.toUpperCase()}`, label: `${KIND_TEXT[u.kind]} ${u.employeeCode} — ${u.fullName}${u.kind === "transfer" ? ` (${u.fromCompanyCode} → ${u.companyCode})` : fields ? ` (${fields})` : ""}` });
  }
  for (const m of plan.managers) out.push({ type: "MANAGER", label: `${m.companyCode} · ${m.departmentName}: ${m.employeeCode ? `trưởng phòng ${m.employeeCode}${m.promote ? " (nâng Trưởng phòng)" : ""}` : "gỡ trưởng phòng"}` });
  return out.slice(0, AUDIT_CHANGE_LIMIT);
}

/**
 * Ghi kế hoạch vào database. `auto` (cron / script) chạm chốt chặn → từ chối; `manual` cần force.
 * Luôn ghi 1 dòng audit LARK_SYNC_RUN (kể cả khi từ chối / lỗi).
 */
export async function applyLarkSync(plan: LarkPlan, opts: { actorId: string | null; trigger: LarkSyncTrigger; force?: boolean }): Promise<ApplyResult> {
  const started = Date.now();
  const baseMeta = { trigger: opts.trigger, counts: plan.counts, guard: plan.guard, warnings: plan.warnings.slice(0, 100), skipped: plan.skipped.length };
  const fail = async (message: string): Promise<ApplyResult> => {
    await logAudit(prisma, { actorId: opts.actorId, companyId: null, action: "LARK_SYNC_RUN", entityType: "System", metadata: { ...baseMeta, applied: false, error: message, durationMs: Date.now() - started } });
    return { ok: false, message };
  };
  if (plan.guard.tripped && (opts.trigger !== "manual" || !opts.force)) {
    return fail(`Chạm chốt chặn: kế hoạch khoá ${plan.guard.lock} / ${plan.guard.active} người đang hoạt động (giới hạn 5% hoặc 20 người). Kiểm tra lại Lark rồi chạy tay và xác nhận.`);
  }

  // 1 mật khẩu ngẫu nhiên cho mọi tài khoản mới của lượt này: passwordSet = false nên không đăng nhập bằng mật khẩu được
  const randomHash = plan.counts.create > 0 ? await bcrypt.hash(randomBytes(32).toString("hex"), 12) : "";
  const orgChangedIds: string[] = [];
  try {
    const locked = await prisma.$transaction(
      async (tx) => {
        const [{ locked }] = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${LOCK_KEY}::bigint) AS locked`;
        if (!locked) return false;
        const now = new Date();
        const larkToId = new Map<string, string>();
        for (const d of await tx.department.findMany({ where: { larkDepartmentId: { not: null } }, select: { id: true, larkDepartmentId: true } })) larkToId.set(d.larkDepartmentId!, d.id);

        // Phòng ban: gỡ liên kết cũ trước (tránh trùng unique), rồi theo tầng cha → con
        for (const d of plan.departments.filter((x) => x.kind === "deactivate")) {
          await tx.department.update({ where: { id: d.id! }, data: { isActive: d.clearLarkId ? undefined : false, ...(d.clearLarkId && { larkDepartmentId: null }) } });
          if (d.clearLarkId && d.larkId) larkToId.delete(d.larkId);
        }
        const ordered = plan.departments.filter((x) => x.kind !== "deactivate").sort((a, b) => a.depth - b.depth);
        for (const d of ordered) {
          const parentId = d.parentLarkId ? (larkToId.get(d.parentLarkId) ?? null) : null;
          if (d.kind === "create") {
            const created = await tx.department.create({ data: { companyId: d.companyId, code: d.code, name: d.name, parentId, larkDepartmentId: d.larkId }, select: { id: true } });
            larkToId.set(d.larkId!, created.id);
          } else {
            await tx.department.update({ where: { id: d.id! }, data: { name: d.name, parentId, isActive: true, larkDepartmentId: d.larkId } });
            larkToId.set(d.larkId!, d.id!);
          }
        }
        // Phòng mất trên Lark (không đổi công ty) → ngừng hoạt động sau khi đã chuyển cha
        for (const d of plan.departments.filter((x) => x.kind === "deactivate" && x.clearLarkId)) {
          const inUse = await tx.user.count({ where: { departmentId: d.id!, status: "ACTIVE" } });
          if (inUse === 0) await tx.department.update({ where: { id: d.id! }, data: { isActive: false } });
        }

        // Nhân viên — tạo theo lô
        const creates = plan.users.filter((u) => u.kind === "create");
        if (creates.length > 0) {
          const rows = await tx.user.createManyAndReturn({
            data: creates.map((u) => ({
              employeeCode: u.employeeCode, fullName: u.fullName, email: u.email, phone: u.phone, hireDate: toDbDate(u.hireDate),
              companyId: u.companyId, departmentId: u.departmentLarkId ? (larkToId.get(u.departmentLarkId) ?? null) : null,
              role: "LEARNER" as const, passwordHash: randomHash, passwordSet: false, mustChangePassword: false, larkUserId: u.larkUserId,
            })),
            select: { id: true, larkUserId: true },
          });
          for (const r of rows) {
            orgChangedIds.push(r.id);
            const p = creates.find((u) => u.larkUserId === r.larkUserId);
            if (p) p.id = r.id;
          }
        }
        for (const u of plan.users.filter((x) => x.kind !== "create")) {
          const deptId = u.keepDepartment ? undefined : u.departmentLarkId ? (larkToId.get(u.departmentLarkId) ?? null) : null;
          if (u.kind === "lock" && u.reason === "Không còn trên Lark") {
            await tx.user.update({ where: { id: u.id! }, data: { status: "INACTIVE", inactiveSource: "LARK", sessionsValidAfter: now } });
            continue;
          }
          if (u.fromCompanyId) {
            // Chuyển công ty: gỡ trưởng phòng ở công ty cũ (như chuyển công ty bằng tay — Việc 6)
            await tx.department.updateMany({ where: { managerId: u.id!, companyId: u.fromCompanyId }, data: { managerId: null } });
          }
          await tx.user.update({
            where: { id: u.id! },
            data: {
              fullName: u.fullName, email: u.email, phone: u.phone, hireDate: toDbDate(u.hireDate), larkUserId: u.larkUserId,
              companyId: u.companyId, ...(deptId !== undefined && { departmentId: deptId }),
              ...(u.kind === "lock" && { status: "INACTIVE" as const, inactiveSource: "LARK" }),
              ...(u.kind === "reopen" && { status: "ACTIVE" as const, inactiveSource: null, failedLoginCount: 0, lockedUntil: null }),
              ...((u.fromCompanyId || u.kind === "lock") && { sessionsValidAfter: now }),
            },
          });
          if (u.orgChanged && u.kind !== "lock") orgChangedIds.push(u.id!);
        }

        // Trưởng phòng
        const idByLarkUser = new Map(plan.users.filter((u) => u.id && u.larkUserId).map((u) => [u.larkUserId!, u.id!]));
        for (const m of plan.managers) {
          const deptId = larkToId.get(m.departmentLarkId);
          if (!deptId) continue;
          const userId = m.larkUserId ? (m.userId ?? idByLarkUser.get(m.larkUserId) ?? null) : null;
          if (m.larkUserId && !userId) continue;
          await tx.department.update({ where: { id: deptId }, data: { managerId: userId } });
          if (userId && m.promote) await tx.user.updateMany({ where: { id: userId, role: "LEARNER" }, data: { role: "MANAGER", sessionsValidAfter: now } });
        }

        await logAudit(tx, {
          actorId: opts.actorId,
          companyId: null,
          action: "LARK_SYNC_RUN",
          entityType: "System",
          metadata: { ...baseMeta, applied: true, changes: changeList(plan), durationMs: Date.now() - started },
        });
        return true;
      },
      { timeout: 10 * 60_000, maxWait: 10_000 },
    );
    if (!locked) return { ok: false, message: "Đang có lượt đồng bộ Lark khác, vui lòng thử lại sau." };
  } catch (e) {
    const message = e instanceof Error ? e.message.slice(0, 500) : "Lỗi không rõ";
    console.error("[lark] Áp dụng đồng bộ thất bại:", message);
    return fail(`Lỗi khi ghi dữ liệu (đã huỷ toàn bộ lượt này): ${message}`);
  }

  // Quy tắc giao tự động cho người mới / đổi phòng / đổi công ty / mở lại (ngoài transaction — như các chỗ khác)
  for (const id of [...new Set(orgChangedIds)]) await onUserOrgChanged(id);
  return { ok: true, counts: plan.counts, durationMs: Date.now() - started };
}

/** Chạy tự động (tác vụ hằng ngày / script): tính kế hoạch rồi áp dụng (chốt chặn bắt buộc). */
export async function runLarkSyncAuto(trigger: "cron" | "script", actorId: string | null = null): Promise<ApplyResult & { plan?: LarkPlan }> {
  const plan = await planLarkSync();
  const result = await applyLarkSync(plan, { actorId, trigger });
  return { ...result, plan };
}
