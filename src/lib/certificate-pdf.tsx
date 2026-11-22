import "server-only";
/* eslint-disable jsx-a11y/alt-text -- <Image> của @react-pdf/renderer vẽ vào PDF, không phải thẻ <img> HTML (không có thuộc tính alt) */
import path from "node:path";
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import QRCode from "qrcode";
import type { TemplateSnapshot } from "@/lib/certificates";
import { formatDate } from "@/lib/format";
import { getSetting } from "@/lib/settings";
import { readFile } from "@/lib/storage";

/**
 * PDF chứng nhận (Việc 22) — CHỈ chạy ở server. A4 ngang, màu theo docs/design-system.md (PDF không dùng được biến CSS).
 *
 * Font Be Vietnam Pro: file TTF ĐẦY ĐỦ của gói @expo-google-fonts/be-vietnam-pro (giấy phép OFL).
 * KHÔNG dùng @fontsource: gói đó chỉ có file theo bộ ký tự (latin / latin-ext / vietnamese) — ghép nhiều bộ trong react-pdf
 * làm sai glyph chữ có dấu (đã thử: "CHỨNG" thành "CHQNG").
 * Bản build standalone: next.config.ts → outputFileTracingIncludes chép 3 file .ttf này vào .next/standalone.
 */

const PRIMARY = "#7367F0";
const PRIMARY_LIGHT = "#E9E7FD";
const TEXT = "#444050";
const MUTED = "#6D6B77";
const DANGER = "#FF4C51";

const FONT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "node_modules", "@expo-google-fonts", "be-vietnam-pro");
const FAMILY = "BeVietnamPro";
const FONT_FILES = [
  { weight: 400, file: "400Regular/BeVietnamPro_400Regular.ttf" },
  { weight: 600, file: "600SemiBold/BeVietnamPro_600SemiBold.ttf" },
  { weight: 700, file: "700Bold/BeVietnamPro_700Bold.ttf" },
];

let fontsRegistered = false;
function registerFonts() {
  if (fontsRegistered) return;
  Font.register({
    family: FAMILY,
    // turbopackIgnore: đường dẫn font chỉ dùng lúc chạy; file đã khai báo ở next.config.ts (outputFileTracingIncludes)
    fonts: FONT_FILES.map((f) => ({ src: path.join(/*turbopackIgnore: true*/ FONT_DIR, f.file), fontWeight: f.weight })),
  });
  // Không ngắt chữ giữa từ (tiếng Việt không dùng gạch nối)
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

/** Ảnh từ storage → data URL PNG/JPG (react-pdf không đọc WEBP → đổi sang PNG bằng sharp). */
async function imageDataUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  try {
    const file = await readFile(key);
    if (!file) return null;
    if (file.contentType === "image/webp") {
      const sharp = (await import("sharp")).default;
      const png = await sharp(file.data).png().toBuffer();
      return `data:image/png;base64,${png.toString("base64")}`;
    }
    if (file.contentType !== "image/png" && file.contentType !== "image/jpeg") return null;
    return `data:${file.contentType};base64,${file.data.toString("base64")}`;
  } catch (error) {
    console.error(`[certificate-pdf] Không đọc được ảnh ${key}:`, error);
    return null;
  }
}

function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export type CertificatePdfData = {
  code: string;
  recipientName: string;
  courseTitle: string;
  courseVersion: number;
  issuedAt: Date;
  expiresAt: Date | null;
  revoked: boolean;
  snapshot: TemplateSnapshot;
};

const s = StyleSheet.create({
  page: { fontFamily: FAMILY, color: TEXT, padding: 24, backgroundColor: "#FFFFFF" },
  outer: { flex: 1, borderWidth: 3, borderColor: PRIMARY, borderRadius: 8, padding: 6 },
  inner: {
    flex: 1,
    borderWidth: 1,
    borderColor: PRIMARY,
    borderRadius: 6,
    paddingVertical: 28,
    paddingHorizontal: 48,
    position: "relative",
    backgroundColor: "#FFFFFF",
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", height: 56 },
  logo: { maxHeight: 56, maxWidth: 180, objectFit: "contain" },
  companyTop: { fontSize: 10, color: MUTED, fontWeight: 600, textAlign: "right", maxWidth: 300 },
  heading: { marginTop: 8, textAlign: "center", fontSize: 30, fontWeight: 700, color: PRIMARY, letterSpacing: 2 },
  bar: { alignSelf: "center", width: 80, height: 3, backgroundColor: PRIMARY, borderRadius: 2, marginTop: 10, marginBottom: 18 },
  certify: { textAlign: "center", fontSize: 13, color: MUTED },
  name: { textAlign: "center", fontSize: 34, fontWeight: 700, marginTop: 6, color: TEXT },
  completed: { textAlign: "center", fontSize: 13, color: MUTED, marginTop: 10 },
  course: { textAlign: "center", fontSize: 20, fontWeight: 600, color: TEXT, marginTop: 6, paddingHorizontal: 40 },
  version: { textAlign: "center", fontSize: 11, color: MUTED, marginTop: 4 },
  dates: { flexDirection: "row", justifyContent: "center", gap: 28, marginTop: 14 },
  dateItem: { fontSize: 11, color: TEXT },
  bottom: { position: "absolute", left: 48, right: 48, bottom: 24, flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  codeBox: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  qr: { width: 70, height: 70 },
  codeLabel: { fontSize: 8, color: MUTED },
  codeValue: { fontSize: 11, fontWeight: 600, color: TEXT, marginTop: 2 },
  verifyText: { fontSize: 7, color: MUTED, marginTop: 2, maxWidth: 220 },
  signer: { width: 240, alignItems: "center" },
  signature: { height: 54, maxWidth: 200, objectFit: "contain", marginBottom: 2 },
  signatureSpace: { height: 54 },
  signLine: { width: 200, borderTopWidth: 1, borderTopColor: "#D1D0D4", marginBottom: 4 },
  signerName: { fontSize: 12, fontWeight: 700, color: TEXT, textAlign: "center" },
  signerTitle: { fontSize: 10, color: MUTED, textAlign: "center", marginTop: 1 },
  signerCompany: { fontSize: 10, color: MUTED, textAlign: "center", marginTop: 1 },
  band: { position: "absolute", left: 0, right: 0, height: 10, backgroundColor: PRIMARY_LIGHT },
  watermark: {
    position: "absolute",
    top: 220,
    left: 0,
    right: 0,
    textAlign: "center",
    fontSize: 96,
    fontWeight: 700,
    color: DANGER,
    opacity: 0.18,
    transform: "rotate(-18deg)",
  },
});

function CertificateDocument({
  data,
  logo,
  signature,
  qr,
  systemName,
}: {
  data: CertificatePdfData;
  logo: string | null;
  signature: string | null;
  qr: string;
  systemName: string;
}) {
  const t = data.snapshot;
  return (
    <Document title={`Chứng nhận ${data.code}`} author={t.companyName || systemName} language="vi">
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.outer}>
          <View style={s.inner}>
            {/* Dải trang trí trên / dưới, nằm trong khung */}
            <View style={[s.band, { top: 0, borderTopLeftRadius: 5, borderTopRightRadius: 5 }]} />
            <View style={[s.band, { bottom: 0, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 }]} />

            <View style={s.topRow}>
              {logo ? <Image src={logo} style={s.logo} /> : <View />}
              {t.companyName ? <Text style={s.companyTop}>{t.companyName}</Text> : null}
            </View>

            <Text style={s.heading}>CHỨNG NHẬN HOÀN THÀNH</Text>
            <View style={s.bar} />
            <Text style={s.certify}>Chứng nhận</Text>
            <Text style={s.name}>{data.recipientName}</Text>
            <Text style={s.completed}>đã hoàn thành khoá học</Text>
            <Text style={s.course}>{data.courseTitle}</Text>
            <Text style={s.version}>phiên bản v{data.courseVersion}</Text>
            <View style={s.dates}>
              <Text style={s.dateItem}>Ngày cấp: {formatDate(data.issuedAt)}</Text>
              <Text style={s.dateItem}>{data.expiresAt ? `Có hiệu lực đến ${formatDate(data.expiresAt)}` : "Không thời hạn"}</Text>
            </View>

            <View style={s.bottom}>
              <View style={s.codeBox}>
                <Image src={qr} style={s.qr} />
                <View>
                  <Text style={s.codeLabel}>Mã chứng nhận</Text>
                  <Text style={s.codeValue}>{data.code}</Text>
                  <Text style={s.verifyText}>Quét mã QR hoặc mở {appUrl()}/verify để tra cứu</Text>
                </View>
              </View>
              <View style={s.signer}>
                {signature ? <Image src={signature} style={s.signature} /> : <View style={s.signatureSpace} />}
                <View style={s.signLine} />
                {t.signerName ? <Text style={s.signerName}>{t.signerName}</Text> : null}
                {t.signerTitle ? <Text style={s.signerTitle}>{t.signerTitle}</Text> : null}
                {t.companyName ? <Text style={s.signerCompany}>{t.companyName}</Text> : null}
              </View>
            </View>

            {data.revoked && <Text style={s.watermark}>ĐÃ THU HỒI</Text>}
          </View>
        </View>
      </Page>
    </Document>
  );
}

/** Tạo file PDF chứng nhận. */
export async function renderCertificatePdf(data: CertificatePdfData): Promise<Buffer> {
  registerFonts();
  const [logo, signature, qr, systemName] = await Promise.all([
    imageDataUrl(data.snapshot.logoKey),
    imageDataUrl(data.snapshot.signatureKey),
    QRCode.toDataURL(`${appUrl()}/verify/${encodeURIComponent(data.code)}`, { margin: 0, width: 280, color: { dark: TEXT } }),
    getSetting("SYSTEM_NAME"),
  ]);
  return renderToBuffer(<CertificateDocument data={data} logo={logo} signature={signature} qr={qr} systemName={systemName} />);
}

/** Tên file tải về: ChungNhan_<ma-khoa>_<ma-NV>.pdf */
export function certificateFileName(courseCode: string | null, employeeCode: string): string {
  const clean = (v: string) => v.replace(/[^A-Za-z0-9_-]+/g, "-");
  return `ChungNhan_${clean(courseCode ?? "KHOA")}_${clean(employeeCode)}.pdf`;
}

/** Response tải PDF (tên file mã hoá RFC 5987). */
export function pdfResponse(buffer: Buffer, fileName: string, inline = false): Response {
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
