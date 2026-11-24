"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Link2, Loader2, Search, Unlink } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogClose, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { loadLarkTreeAction, saveLarkMappingAction, type LarkTreeNode } from "./actions";

type CompanyRow = { id: string; code: string; name: string; isActive: boolean; larkDepartmentId: string | null; larkName: string | null };

/** Ghép mỗi công ty với 1 phòng ban gốc trên Lark — mọi phòng / người dưới nhánh đó thuộc công ty này. */
export function LarkMapping({ companies, configured }: { companies: CompanyRow[]; configured: boolean }) {
  const [editing, setEditing] = useState<CompanyRow | null>(null);
  const [tree, setTree] = useState<LarkTreeNode[] | null>(null);
  const [loading, startLoading] = useTransition();

  function open(c: CompanyRow) {
    setEditing(c);
    if (tree) return;
    startLoading(async () => {
      try {
        const r = await loadLarkTreeAction();
        if (!r.ok) {
          toast.error(r.message);
          setEditing(null);
          return;
        }
        setTree(r.departments);
      } catch {
        toast.error("Không tải được cây phòng ban Lark.");
        setEditing(null);
      }
    });
  }

  return (
    <section className="rounded-md bg-card shadow-md" aria-labelledby="lark-mapping">
      <header className="border-b border-border p-6">
        <h2 id="lark-mapping" className="text-lg font-medium text-foreground">
          Ghép công ty với phòng ban Lark
        </h2>
        <p className="text-[13px] text-muted-foreground">
          Mỗi công ty chọn 1 phòng ban gốc trên Lark. Người ở ngoài mọi nhánh đã ghép sẽ không được đồng bộ. Không chọn được phòng nằm trong / chứa nhánh của công ty khác.
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-[15px]">
          <thead>
            <tr className="border-b border-border text-left text-[13px] font-medium tracking-[0.2px] text-foreground uppercase">
              <th className="h-14 pr-4 pl-6">Công ty</th>
              <th className="h-14 px-4">Phòng ban gốc trên Lark</th>
              <th className="h-14 pr-6 pl-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {companies.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="h-[54px] pr-4 pl-6">
                  <p className="font-medium text-foreground">
                    {c.code}
                    {!c.isActive && <span className="ml-2 text-[13px] font-normal text-muted-foreground">(tạm ngưng)</span>}
                  </p>
                  <p className="max-w-80 truncate text-[13px] text-muted-foreground" title={c.name}>
                    {c.name}
                  </p>
                </td>
                <td className="px-4">
                  {c.larkName ? (
                    <span className="inline-flex items-center gap-2">
                      <Link2 className="size-4 text-success" />
                      <span className="text-foreground">{c.larkName}</span>
                    </span>
                  ) : (
                    <StatusBadge tone="secondary">Chưa ghép</StatusBadge>
                  )}
                </td>
                <td className="pr-6 pl-4">
                  <div className="flex justify-end gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={!configured} onClick={() => open(c)}>
                      {c.larkDepartmentId ? "Đổi phòng" : "Chọn phòng Lark"}
                    </Button>
                    {c.larkDepartmentId && (
                      <ConfirmDialog
                        trigger={
                          <Button type="button" variant="ghost" size="sm" className="text-destructive">
                            <Unlink />
                            Bỏ ghép
                          </Button>
                        }
                        title={`Bỏ ghép ${c.code} với “${c.larkName}”?`}
                        description="Lần đồng bộ sau sẽ không cập nhật người / phòng ban của công ty này nữa (không xoá hay khoá ai)."
                        confirmLabel="Bỏ ghép"
                        tone="destructive"
                        action={saveLarkMappingAction.bind(null, c.id, null)}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && (
        <TreeDialog
          company={editing}
          tree={tree}
          loading={loading}
          taken={new Map(companies.filter((x) => x.larkDepartmentId && x.id !== editing.id).map((x) => [x.larkDepartmentId!, x.code]))}
          onClose={() => setEditing(null)}
        />
      )}
    </section>
  );
}

function TreeDialog({
  company,
  tree,
  loading,
  taken,
  onClose,
}: {
  company: CompanyRow;
  tree: LarkTreeNode[] | null;
  loading: boolean;
  taken: Map<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, startSaving] = useTransition();

  const { children, byId } = useMemo(() => {
    const children = new Map<string, LarkTreeNode[]>();
    for (const d of tree ?? []) children.set(d.parentOpenId, [...(children.get(d.parentOpenId) ?? []), d]);
    return { children, byId: new Map((tree ?? []).map((d) => [d.openId, d])) };
  }, [tree]);

  // Phòng bị khoá chọn: đã ghép công ty khác, nằm trong hoặc chứa nhánh của công ty khác
  const blocked = useMemo(() => {
    const out = new Map<string, string>();
    const ancestors = (id: string) => {
      const list: string[] = [];
      for (let cur = byId.get(id)?.parentOpenId; cur && cur !== "0"; cur = byId.get(cur)?.parentOpenId) list.push(cur);
      return list;
    };
    for (const [openId, code] of taken) {
      out.set(openId, `Đã ghép ${code}`);
      for (const a of ancestors(openId)) if (!out.has(a)) out.set(a, `Chứa nhánh của ${code}`);
      const stack = [...(children.get(openId) ?? [])];
      while (stack.length) {
        const d = stack.pop()!;
        out.set(d.openId, `Thuộc nhánh ${code}`);
        stack.push(...(children.get(d.openId) ?? []));
      }
    }
    return out;
  }, [taken, byId, children]);

  const needle = q.trim().toLowerCase();
  const visible = useMemo(() => {
    if (!needle) return null;
    const keep = new Set<string>();
    for (const d of tree ?? []) {
      if (!d.name.toLowerCase().includes(needle)) continue;
      for (let cur: string | undefined = d.openId; cur && cur !== "0"; cur = byId.get(cur)?.parentOpenId) keep.add(cur);
    }
    return keep;
  }, [needle, tree, byId]);

  function choose(d: LarkTreeNode) {
    startSaving(async () => {
      try {
        const r = await saveLarkMappingAction(company.id, d.openId);
        if (!r.ok) return void toast.error(r.message ?? "Không ghép được.");
        if (r.message) toast.success(r.message);
        onClose();
        router.refresh();
      } catch {
        toast.error("Có lỗi xảy ra, vui lòng thử lại.");
      }
    });
  }

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  function renderLevel(parent: string, depth: number): React.ReactNode {
    const items = (children.get(parent) ?? []).filter((d) => !visible || visible.has(d.openId));
    return items.map((d) => {
      const kids = children.get(d.openId) ?? [];
      const isOpen = !!visible || expanded.has(d.openId);
      const reason = blocked.get(d.openId);
      const current = d.openId === company.larkDepartmentId;
      return (
        <li key={d.openId}>
          <div className={cn("flex min-h-10 items-center gap-1 rounded-md pr-2 hover:bg-muted/50", current && "bg-primary/8")} style={{ paddingLeft: depth * 20 }}>
            {kids.length > 0 ? (
              <button type="button" onClick={() => toggle(d.openId)} className="flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-muted" aria-label={isOpen ? `Thu gọn ${d.name}` : `Mở ${d.name}`} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
              </button>
            ) : (
              <span className="size-7 shrink-0" aria-hidden />
            )}
            <span className="min-w-0 flex-1 truncate text-foreground" title={d.name}>
              {d.name}
            </span>
            {reason ? (
              <span className="shrink-0 text-[13px] text-muted-foreground">{reason}</span>
            ) : current ? (
              <StatusBadge tone="primary">Đang ghép</StatusBadge>
            ) : (
              <Button type="button" size="xs" variant="outline" disabled={saving} onClick={() => choose(d)}>
                Chọn
              </Button>
            )}
          </div>
          {kids.length > 0 && isOpen && <ul>{renderLevel(d.openId, depth + 1)}</ul>}
        </li>
      );
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chọn phòng ban Lark cho {company.code}</DialogTitle>
          <DialogDescription>Mọi phòng ban và nhân viên dưới phòng được chọn sẽ thuộc {company.name}.</DialogDescription>
        </DialogHeader>
        <DialogBody className="grid gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm phòng ban..." aria-label="Tìm phòng ban Lark" className="pl-9" />
          </div>
          {loading || !tree ? (
            <p className="flex items-center gap-2 py-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Đang tải cây phòng ban Lark...
            </p>
          ) : tree.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Không đọc được phòng ban nào trên Lark (kiểm tra phạm vi danh bạ).</p>
          ) : visible && visible.size === 0 ? (
            <p className="py-8 text-center text-muted-foreground">Không có phòng ban nào khớp “{q}”.</p>
          ) : (
            <ul className="max-h-[50vh] overflow-y-auto text-[15px]" aria-label="Cây phòng ban Lark">
              {renderLevel("0", 0)}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>Đóng</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
