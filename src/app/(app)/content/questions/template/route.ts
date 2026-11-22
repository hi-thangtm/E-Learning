import { requireRole } from "@/lib/current-user";
import { workbookToBuffer, xlsxResponse } from "@/lib/excel";
import { buildQuestionWorkbook } from "../excel-format";

/** Tải file mẫu import câu hỏi: GET /content/questions/template */
export async function GET() {
  await requireRole(["GROUP_ADMIN", "COMPANY_ADMIN", "CONTENT_EDITOR"]);
  const wb = buildQuestionWorkbook([], { withExamples: true });
  return xlsxResponse(await workbookToBuffer(wb), "mau-import-cau-hoi.xlsx");
}
