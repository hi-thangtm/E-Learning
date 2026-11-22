import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Ô nhập mã chứng nhận — form GET tới /verify (server chuyển sang /verify/<MÃ>). */
export function VerifyForm({ defaultCode = "" }: { defaultCode?: string }) {
  return (
    <form action="/verify" method="get" className="flex items-center gap-3">
      <label htmlFor="verify-code" className="sr-only">
        Mã chứng nhận
      </label>
      <Input
        id="verify-code"
        name="code"
        defaultValue={defaultCode}
        placeholder="VD: CERT-2026-AB3KZ9"
        maxLength={40}
        autoComplete="off"
        className="uppercase placeholder:normal-case"
        required
      />
      <Button type="submit" className="shrink-0">
        <Search />
        Tra cứu
      </Button>
    </form>
  );
}
