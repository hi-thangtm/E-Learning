"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Eye, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import type { FieldChange, LarkPlan } from "@/lib/lark/sync";
import { cn } from "@/lib/utils";
import { applyLarkSyncAction, previewLarkSyncAction } from "./actions";

type Tab = "create" | "update" | "transfer" | "lock" | "reopen" | "skipped" | "localOnly" | "departments" | "managers" | "warnings";

const GROUPS: { key: Tab; label: string; tone: string }[] = [
  { key: "create", label: "Tạo mới", tone: "text-success" },
  { key: "update", label: "Cập nhật", tone: "text-primary" },
  { key: "transfer", label: "Chuyển công ty", tone: "text-info" },
  { key: "lock", label: "Khoá", tone: "text-destructive" },
  { key: "reopen", label: "Mở lại", tone: "text-success" },
  { key: "skipped", label: "Bỏ qua", tone: "text-warning" },
  { key: "localOnly", label: "Chỉ có ở E-Learning", tone: "text-muted-foreground" },
];

const FIELD: Record<FieldChange["field"], string> = {
  fullName: "Họ tên", email: "Email", phone: "Điện thoại", hireDate: "Ngày vào làm", company: "Công ty", department: "Phòng ban", larkUserId: "Liên kết Lark", status: "Trạng thái",
};
const DEPT_KIND = { create: "Tạo mới", adopt: "Ghép phòng có sẵn", update: "Cập nhật", deactivate: "Ngừng hoạt động" } as const;
const MAX_ROWS = 200;

/** Chạy thử (xem trước) → bảng tổng hợp + chi tiết → Áp dụng. Áp dụng luôn cần chạy thử trước (server so dấu vân tay kế hoạch). */
export function LarkSyncPanel({ configured, mappedCount, everApplied }: { configured: boolean; mappedCount: number; everApplied: boolean }) {
  const router = useRouter();
  const [plan, setPlan] = useState<LarkPlan | null>(null);
  const [tab, setTab] = useState<Tab>("create");
  const [force, setForce] = useState(false);
  const [pending, startTransition] = useTransition();

  function preview() {
    startTransition(async () => {
      try {
        const r = await previewLarkSyncAction();
        if (!r.ok) return void toast.error(r.message);
        setPlan(r.plan);
        setForce(false);
        const first = GROUPS.find((g) => countOf(r.plan, g.key) > 0)?.key ?? "create";
        setTab(first);
      } catch {
        toast.error("Không chạy thử được, vui lòng thử lại.");
      }
    });
  }

  async function apply() {
    if (!plan) return { ok: false, message: "Hãy chạy thử trước." };
    const r = await applyLarkSyncAction(plan.fingerprint, force);
    if (r.ok) {
      setPlan(null);
      router.refresh();
    }
    return r;
  }

  const disabled = !configured || mappedCount === 0;
  const total = plan ? plan.counts.create + plan.counts.update + plan.counts.transfer + plan.counts.lock + plan.counts.reopen + plan.counts.departments + plan.counts.managers : 0;

  return (
    <section className="rounded-md bg-card shadow-md" aria-labelledby="lark-sync">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-6">
        <div>
          <h2 id="lark-sync" className="text-lg font-medium text-foreground">
            Đồng bộ
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {disabled
              ? !configured
                ? "Cấu hình Lark trong .env trước khi đồng bộ."
                : "Ghép ít nhất 1 công ty với phòng ban Lark trước khi đồng bộ."
              : everApplied
                ? "Tác vụ hằng ngày tự đồng bộ trước mọi bước khác (bỏ qua nếu chạm chốt chặn). Có thể chạy tay bất cứ lúc nào."
                : "Chưa áp dụng lần nào: hãy chạy thử, kiểm tra kỹ rồi áp dụng. Tác vụ hằng ngày chỉ tự đồng bộ sau lần áp dụng thủ công đầu tiên."}
          </p>
        </div>
        <Button type="button" onClick={preview} disabled={disabled || pending}>
          {pending ? <Loader2 className="animate-spin" /> : <Eye />}
          {pending ? "Đang đọc Lark..." : "Chạy thử (xem trước)"}
        </Button>
      </header>

      {plan && (
        <div className="grid gap-6 p-6">
          <p className="text-[13px] text-muted-foreground">
            Lark: {formatNumber(plan.larkDepartments)} phòng ban, {formatNumber(plan.larkUsers)} nhân viên · thay đổi phòng ban {formatNumber(plan.counts.departments)} · trưởng phòng{" "}
            {formatNumber(plan.counts.managers)}
            {plan.warnings.length > 0 && ` · ${formatNumber(plan.warnings.length)} cảnh báo`}
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {GROUPS.map((g) => (
              <button
                key={g.key}
                type="button"
                onClick={() => setTab(g.key)}
                aria-pressed={tab === g.key}
                className={cn(
                  "rounded-md border p-3 text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  tab === g.key ? "border-primary bg-primary/8" : "border-border hover:border-muted-foreground",
                )}
              >
                <span className="block text-[13px] text-muted-foreground">{g.label}</span>
                <span className={cn("text-2xl font-medium tabular-nums", g.tone)}>{formatNumber(countOf(plan, g.key))}</span>
              </button>
            ))}
          </div>

          {plan.guard.tripped && (
            <div role="alert" className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3 text-[15px] text-foreground">
              <TriangleAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
              <div className="grid gap-2">
                <p>
                  <b className="text-destructive">Chạm chốt chặn:</b> kế hoạch khoá {formatNumber(plan.guard.lock)} / {formatNumber(plan.guard.active)} người đang hoạt động (giới hạn 5% hoặc 20 người).
                  Có thể do ghép sai phòng ban hoặc Lark đang lỗi — kiểm tra tab “Khoá” trước. Tác vụ hằng ngày sẽ KHÔNG tự áp dụng kế hoạch như này.
                </p>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4 accent-destructive" checked={force} onChange={(e) => setForce(e.target.checked)} />
                  Tôi đã kiểm tra, vẫn áp dụng
                </label>
              </div>
            </div>
          )}

          <SegmentedControl
            ariaLabel="Xem chi tiết"
            className="flex-wrap"
            value={tab}
            onChange={setTab}
            options={[
              ...GROUPS.map((g) => ({ value: g.key, label: g.label })),
              { value: "departments" as const, label: "Phòng ban" },
              { value: "managers" as const, label: "Trưởng phòng" },
              { value: "warnings" as const, label: "Cảnh báo" },
            ]}
          />

          <Detail plan={plan} tab={tab} />

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
            <a href="/system/lark/export" className={buttonVariants({ variant: "outline" })} download>
              <Download />
              Tải Excel chi tiết
            </a>
            <ConfirmDialog
              trigger={
                <Button type="button" disabled={total === 0 || (plan.guard.tripped && !force)}>
                  <RefreshCw />
                  Áp dụng
                </Button>
              }
              title="Áp dụng đồng bộ Lark?"
              description={`Tạo ${plan.counts.create}, cập nhật ${plan.counts.update}, chuyển công ty ${plan.counts.transfer}, khoá ${plan.counts.lock}, mở lại ${plan.counts.reopen} tài khoản; ${plan.counts.departments} thay đổi phòng ban, ${plan.counts.managers} thay đổi trưởng phòng. Người bị khoá bị đăng xuất ngay.`}
              confirmLabel="Áp dụng"
              tone={plan.counts.lock > 0 ? "destructive" : "default"}
              action={apply}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function countOf(plan: LarkPlan, key: Tab): number {
  if (key === "skipped") return plan.counts.skipped;
  if (key === "localOnly") return plan.counts.localOnly;
  if (key === "departments") return plan.counts.departments;
  if (key === "managers") return plan.counts.managers;
  if (key === "warnings") return plan.warnings.length;
  return plan.counts[key];
}

function Detail({ plan, tab }: { plan: LarkPlan; tab: Tab }) {
  const th = "h-11 px-3 text-left text-[13px] font-medium tracking-[0.2px] text-foreground uppercase first:pl-0";
  const td = "px-3 py-2.5 align-top first:pl-0";
  let head: string[] = [];
  let rows: React.ReactNode[][] = [];

  if (tab === "skipped") {
    head = ["Mã NV", "Họ tên", "Lý do"];
    rows = plan.skipped.map((s) => [s.employeeCode ?? "—", s.fullName || "—", s.reason]);
  } else if (tab === "localOnly") {
    head = ["Mã NV", "Họ tên", "Công ty", "Trạng thái"];
    rows = plan.localOnly.map((u) => [u.employeeCode, u.fullName, u.companyCode, u.status === "ACTIVE" ? "Đang làm" : "Đã khoá"]);
  } else if (tab === "departments") {
    head = ["Công ty", "Mã", "Phòng ban", "Thay đổi"];
    rows = plan.departments.map((d) => [d.companyCode, d.code, d.name, `${DEPT_KIND[d.kind]}${d.changes.length ? ` — ${d.changes.join("; ")}` : ""}`]);
  } else if (tab === "managers") {
    head = ["Công ty", "Phòng ban", "Trưởng phòng"];
    rows = plan.managers.map((m) => [m.companyCode, m.departmentName, m.employeeCode ? `${m.fullName} (${m.employeeCode})${m.promote ? " · nâng vai trò Trưởng phòng" : ""}` : "Gỡ trưởng phòng"]);
  } else if (tab === "warnings") {
    head = ["Cảnh báo"];
    rows = plan.warnings.map((w) => [w]);
  } else {
    head = ["Mã NV", "Họ tên", "Công ty", "Phòng ban", "Thay đổi"];
    rows = plan.users
      .filter((u) => u.kind === tab)
      .map((u) => [
        u.employeeCode,
        u.fullName,
        u.fromCompanyCode ? `${u.fromCompanyCode} → ${u.companyCode}` : u.companyCode,
        u.keepDepartment ? "(giữ nguyên)" : (u.departmentName ?? "—"),
        u.kind === "create" ? "Tài khoản mới (chưa có mật khẩu)" : [u.reason, ...u.changes.map((c) => `${FIELD[c.field]}: ${c.from ?? "—"} → ${c.to ?? "—"}`)].filter(Boolean).join("; "),
      ]);
  }

  if (rows.length === 0) return <p className="py-6 text-center text-muted-foreground">Không có mục nào.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[15px]">
        <thead>
          <tr className="border-b border-border">{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.slice(0, MAX_ROWS).map((r, i) => (
            <tr key={i} className="border-b border-border last:border-0">
              {r.map((c, j) => (
                <td key={j} className={cn(td, j === r.length - 1 ? "text-[13px] text-muted-foreground" : "text-foreground")}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > MAX_ROWS && <p className="pt-3 text-[13px] text-muted-foreground">Đang hiện {MAX_ROWS} / {formatNumber(rows.length)} dòng — tải Excel để xem đủ.</p>}
    </div>
  );
}
