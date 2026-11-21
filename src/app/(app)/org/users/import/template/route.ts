import { requireRole } from "@/lib/current-user";
import { workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { buildTemplateWorkbook, resolveImportCompany } from "../import-service";

/**
 * Tải file mẫu import nhân viên: GET /org/users/import/template?company=<id>
 * Tạo động theo công ty (danh sách phòng ban đang dùng của công ty đó).
 * Admin công ty luôn nhận file của công ty mình (bỏ qua ?company).
 */
export async function GET(request: Request) {
  const actor = await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN"]);
  const companyId = new URL(request.url).searchParams.get("company");

  const company = await resolveImportCompany(actor, companyId);
  if ("error" in company) {
    return new Response(company.error, { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const wb = await buildTemplateWorkbook(company);
  return xlsxResponse(await workbookToBuffer(wb), `mau-import-nhan-vien-${company.code}.xlsx`);
}
