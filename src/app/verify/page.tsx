import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { VerifyForm } from "./verify-form";

/** /verify — nhập mã chứng nhận để tra cứu. /verify?code=... → /verify/<MÃ>. */
export default async function VerifyHomePage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
  const raw = (await searchParams).code;
  const code = (Array.isArray(raw) ? raw[0] : raw)?.trim().toUpperCase();
  if (code) redirect(`/verify/${encodeURIComponent(code.slice(0, 40))}`);

  return (
    <section className="rounded-md bg-card p-8 shadow-md">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex size-12 items-center justify-center rounded-md bg-primary/16 text-primary">
          <ShieldCheck className="size-6" />
        </span>
        <div>
          <h1 className="text-2xl font-medium text-foreground">Tra cứu chứng nhận</h1>
          <p className="text-[15px] text-muted-foreground">Nhập mã in trên chứng nhận (hoặc quét mã QR) để kiểm tra chứng nhận còn hiệu lực.</p>
        </div>
      </div>
      <VerifyForm />
    </section>
  );
}
