import ExcelJS from "exceljs";

/** Tạo file .xlsx (1 sheet) từ dòng tiêu đề + các dòng dữ liệu → Buffer để setInputFiles */
export async function makeXlsx(sheet: string, header: string[], rows: (string | number | Date | null)[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheet);
  ws.addRow(header);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Đọc file .xlsx: tên các sheet + dữ liệu sheet (mảng dòng, mỗi dòng là mảng giá trị chữ) */
export async function readXlsx(buf: Buffer): Promise<Map<string, string[][]>> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const out = new Map<string, string[][]>();
  wb.eachSheet((ws) => {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const values = (row.values as ExcelJS.CellValue[]).slice(1).map((v) => {
        if (v === null || v === undefined) return "";
        if (typeof v === "object" && "result" in v) return String(v.result ?? "");
        if (typeof v === "object" && "richText" in v) return v.richText.map((t) => t.text).join("");
        if (v instanceof Date) return v.toISOString();
        return String(v);
      });
      rows.push(values);
    });
    out.set(ws.name, rows);
  });
  return out;
}

/** PDF hợp lệ tối thiểu (1 trang trắng) để tải lên bài tài liệu */
export function tinyPdf(): Buffer {
  const objs = [
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n",
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n",
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of objs) {
    offsets.push(body.length);
    body += o;
  }
  const xref = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
