"use client";

import { useActionState, useEffect, useEffectEvent, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, TriangleAlert, Users } from "lucide-react";
import { toast } from "sonner";
import { FormField } from "@/components/form-field";
import { SegmentedControl } from "@/components/segmented-control";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { initialActionState } from "@/lib/action-state";
import { formatNumber } from "@/lib/format";
import { flattenTree } from "@/lib/tree";
import { cn } from "@/lib/utils";
import { previewRuleAction, saveRuleAction } from "./actions";
import type { RuleFormOptions, RuleFormValue, RuleKind, RulePreview } from "./types";

const NONE = "__none__";
const WHOLE_GROUP = "__group__";

/**
 * Form tạo / sửa quy tắc giao tự động. Xem trước trực tiếp khi đổi điều kiện (chờ 400ms).
 * Quy tắc giao khoá học HOẶC lộ trình. Khi sửa: loại + khoá / lộ trình cố định; thu hẹp nhóm không thu hồi lượt đã giao.
 */
export function RuleForm({
  options,
  rule,
  initial,
}: {
  options: RuleFormOptions;
  rule?: RuleFormValue;
  initial?: { kind: RuleKind; id: string } | null;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(saveRuleAction, initialActionState);
  const err = state.errors ?? {};

  const [name, setName] = useState(rule?.name ?? "");
  const [kind, setKind] = useState<RuleKind>(rule?.kind ?? initial?.kind ?? "course");
  const [courseId, setCourseId] = useState(rule?.subjectId ?? initial?.id ?? "");
  const [dueInDays, setDueInDays] = useState(String(rule?.dueInDays ?? options.defaultDays));
  const [companyId, setCompanyId] = useState(rule ? rule.targetCompanyId : options.isGroupAdmin ? "" : options.actorCompanyId);
  const [departmentId, setDepartmentId] = useState(rule?.departmentId ?? "");
  const [includeSub, setIncludeSub] = useState(rule?.includeSubDepartments ?? true);
  const [positionId, setPositionId] = useState(rule?.positionId ?? "");

  const subjects = kind === "path" ? options.paths : options.courses;
  const noun = kind === "path" ? "lộ trình" : "khoá học";
  const course = subjects.find((c) => c.id === courseId);
  // Khoá / lộ trình của công ty con -> công ty áp dụng cố định = công ty đó
  const lockedCompany = course && course.ownerCompanyId !== options.groupCompanyId ? course.ownerCompanyId : !options.isGroupAdmin ? options.actorCompanyId : null;
  const effectiveCompany = lockedCompany ?? companyId;

  const done = useEffectEvent((message?: string) => {
    if (message) toast.success(message);
    router.push("/assign/rules");
  });
  useEffect(() => {
    if (state.ok) done(state.message);
    else if (state.message) toast.error(state.message);
  }, [state]);

  // --- Xem trước ---
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [previewing, startPreview] = useTransition();
  useEffect(() => {
    if (!courseId) return;
    const t = setTimeout(() => {
      startPreview(async () => {
        try {
          setPreview(
            await previewRuleAction(
              { kind, subjectId: courseId, targetCompanyId: effectiveCompany, departmentId, positionId, includeSubDepartments: includeSub },
              Number(dueInDays) || options.defaultDays,
              rule?.id,
            ),
          );
        } catch {
          setPreview({ ok: false, message: "Không xem trước được, vui lòng thử lại." });
        }
      });
    }, 400);
    return () => clearTimeout(t);
  }, [kind, courseId, effectiveCompany, departmentId, positionId, includeSub, dueInDays, options.defaultDays, rule?.id]);

  const courseItems = subjects.map((c) => ({
    value: c.id,
    label: `${c.title} (${c.code}) · công ty ${c.ownerCode}${c.published ? "" : " — không còn phát hành"}`,
  }));
  const companyItems = [
    ...(options.isGroupAdmin && !lockedCompany ? [{ value: WHOLE_GROUP, label: "Toàn tập đoàn" }] : []),
    ...options.companies.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })),
  ];
  const departmentItems = useMemo(() => {
    const rows = options.departments.filter((d) => d.companyId === effectiveCompany && (d.isActive || d.id === rule?.departmentId));
    return [
      { value: NONE, label: "— Mọi phòng ban —" },
      ...flattenTree(rows, "all").map(({ row, depth }) => ({ value: row.id, label: `${"   ".repeat(depth)}${row.name}` })),
    ];
  }, [options.departments, effectiveCompany, rule?.departmentId]);
  const positionItems = [
    { value: NONE, label: "— Mọi chức danh —" },
    ...options.positions.filter((p) => p.isActive || p.id === rule?.positionId).map((p) => ({ value: p.id, label: p.name })),
  ];

  return (
    <form action={formAction} noValidate className="grid grid-cols-5 items-start gap-6">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="subjectId" value={courseId} />
      <input type="hidden" name="targetCompanyId" value={effectiveCompany} />
      <input type="hidden" name="departmentId" value={departmentId} />
      <input type="hidden" name="positionId" value={positionId} />
      <input type="hidden" name="includeSubDepartments" value={includeSub ? "1" : "0"} />

      <section className="col-span-3 grid content-start gap-4 rounded-md bg-card p-6 shadow-md">
        <h2 className="text-lg font-medium text-foreground">Thông tin quy tắc</h2>
        <FormField label="Tên quy tắc" htmlFor="name" required error={err.name}>
          <Input id="name" name="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={150} placeholder="VD: Nhân viên kinh doanh học Quy trình bán hàng" aria-invalid={!!err.name} />
        </FormField>

        <FormField label="Giao" htmlFor="rule-kind" hint={rule ? "Không đổi được loại của quy tắc đã tạo." : undefined}>
          <SegmentedControl
            id="rule-kind"
            ariaLabel="Quy tắc giao khoá học hay lộ trình"
            options={[
              { value: "course", label: "Khoá học" },
              { value: "path", label: "Lộ trình" },
            ]}
            value={kind}
            disabled={!!rule}
            onChange={(k) => {
              setKind(k);
              setCourseId("");
              setPreview(null);
            }}
          />
        </FormField>

        <FormField
          label={kind === "path" ? "Lộ trình" : "Khoá học"}
          htmlFor="course-select"
          required
          error={err.subjectId}
          hint={rule ? `Không đổi được ${noun} của quy tắc đã tạo.` : `Chỉ ${noun} đã phát hành trong phạm vi của bạn.`}
        >
          <Select key={kind} items={courseItems} value={courseId || null} disabled={!!rule} onValueChange={(v) => { setCourseId(v ? String(v) : ""); setDepartmentId(""); }}>
            <SelectTrigger id="course-select" className="w-full" aria-invalid={!!err.subjectId}>
              <SelectValue placeholder={`Chọn ${noun}`} />
            </SelectTrigger>
            <SelectContent>
              {courseItems.map((i) => (
                <SelectItem key={i.value} value={i.value}>
                  {i.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Hạn hoàn thành (số ngày kể từ khi được giao)" htmlFor="dueInDays" required error={err.dueInDays}>
          <Input id="dueInDays" name="dueInDays" type="number" min={1} max={365} value={dueInDays} onChange={(e) => setDueInDays(e.target.value)} className="w-32" aria-invalid={!!err.dueInDays} />
        </FormField>

        <div className="grid gap-4 rounded-md border border-border p-4">
          <div>
            <p className="font-medium text-foreground">Nhóm áp dụng</p>
            <p className="text-[13px] text-muted-foreground">Điều kiện kết hợp kiểu VÀ; để trống = không lọc theo điều kiện đó.</p>
          </div>
          <FormField
            label="Công ty"
            htmlFor="company-select"
            error={err.targetCompanyId}
            hint={lockedCompany ? (course && course.ownerCompanyId !== options.groupCompanyId ? `${kind === "path" ? "Lộ trình" : "Khoá"} của công ty con chỉ áp dụng trong công ty đó.` : "Bạn chỉ tạo quy tắc cho công ty mình.") : undefined}
          >
            <Select
              items={companyItems}
              value={effectiveCompany || WHOLE_GROUP}
              disabled={!!lockedCompany}
              onValueChange={(v) => {
                setCompanyId(!v || v === WHOLE_GROUP ? "" : String(v));
                setDepartmentId("");
              }}
            >
              <SelectTrigger id="company-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {companyItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Phòng ban" htmlFor="department-select" error={err.departmentId} hint={!effectiveCompany ? "Chọn công ty trước để lọc theo phòng ban." : undefined}>
            <Select items={departmentItems} value={departmentId || NONE} disabled={!effectiveCompany} onValueChange={(v) => setDepartmentId(!v || v === NONE ? "" : String(v))}>
              <SelectTrigger id="department-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {departmentItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          {departmentId && (
            <label className="flex items-center gap-3">
              <Switch checked={includeSub} onCheckedChange={setIncludeSub} />
              <span className="text-[15px] text-foreground">Gồm cả phòng con</span>
            </label>
          )}
          <FormField label="Chức danh" htmlFor="position-select" error={err.positionId}>
            <Select items={positionItems} value={positionId || NONE} onValueChange={(v) => setPositionId(!v || v === NONE ? "" : String(v))}>
              <SelectTrigger id="position-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {positionItems.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
        </div>

        <p className="flex items-start gap-2 rounded-md bg-info/16 px-4 py-2.5 text-[13px] text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          {kind === "path" ? "Lộ trình được giao = mọi khoá của lộ trình, cùng một hạn. " : ""}Lưu quy tắc sẽ giao ngay cho mọi người đang khớp, và tự giao cho người vào nhóm sau này. Thu hẹp nhóm không thu hồi lượt đã giao, chỉ áp dụng thêm cho người mới khớp.
        </p>

        <div className="flex justify-end gap-4 border-t border-border pt-4">
          <Link href="/assign/rules" className={buttonVariants({ variant: "outline" })}>
            Huỷ
          </Link>
          <Button type="submit" disabled={pending || !courseId}>
            {pending ? "Đang lưu..." : rule ? "Lưu quy tắc" : "Tạo và giao ngay"}
          </Button>
        </div>
      </section>

      {/* Xem trước */}
      <section className="col-span-2 self-start rounded-md bg-card p-6 shadow-md" aria-live="polite">
        <h2 className="mb-1 flex items-center gap-2 text-lg font-medium text-foreground">
          <Users className="size-5 text-primary" />
          Xem trước
        </h2>
        {!courseId ? (
          <p className="text-[15px] text-muted-foreground">Chọn {noun} để xem ai sẽ được giao.</p>
        ) : !preview ? (
          <p className="text-[15px] text-muted-foreground">Đang tính...</p>
        ) : !preview.ok ? (
          <p className="text-[15px] text-destructive">{preview.message}</p>
        ) : (
          <div className={cn("grid gap-4", previewing && "opacity-60")}>
            <p className="text-[13px] text-muted-foreground">{preview.target}</p>
            {!preview.coursePublished && (
              <p className="flex items-start gap-2 rounded-md bg-warning/16 px-3 py-2 text-[13px] text-warning">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                {preview.kind === "path" ? "Lộ trình" : "Khoá"} không còn phát hành — quy tắc tạm không giao.
              </p>
            )}
            <p className="text-[15px] text-foreground">
              Hiện có <strong className="font-medium">{formatNumber(preview.matched)}</strong> người khớp:{" "}
              <span className="text-success">{formatNumber(preview.newCount)} giao mới</span>,{" "}
              <span>
                {formatNumber(preview.existingCount)} đã có{preview.kind === "path" ? " lộ trình" : ""}
              </span>
              ,{" "}
              <span className="text-muted-foreground">
                {formatNumber(preview.completedCount)} đã hoàn thành{preview.kind === "path" ? " toàn bộ" : ""}
              </span>
              .
            </p>
            {preview.users.length > 0 && (
              <ul className="grid gap-1 border-t border-border pt-3 text-[15px]">
                {preview.users.map((u) => (
                  <li key={u.id} className="flex justify-between gap-3">
                    <span className="truncate text-foreground">
                      {u.fullName} <span className="text-[13px] text-muted-foreground">{u.employeeCode}</span>
                    </span>
                    <span className="shrink-0 truncate text-[13px] text-muted-foreground">{u.departmentName ?? u.companyCode}</span>
                  </li>
                ))}
                {preview.matched > preview.users.length && (
                  <li className="text-[13px] text-muted-foreground">… và {formatNumber(preview.matched - preview.users.length)} người khác</li>
                )}
              </ul>
            )}
          </div>
        )}
      </section>
    </form>
  );
}
