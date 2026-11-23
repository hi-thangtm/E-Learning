/**
 * Ảnh chụp KẾT QUẢ các hàm báo cáo / team-stats / dashboard trên elearning_perf (Việc 30) — để chứng minh tối ưu
 * KHÔNG đổi số liệu:
 *   npm run perf:snapshot -- --out perf-results/before.json [--anchor yyyy-mm-dd]
 *   npm run perf:snapshot -- --compare perf-results/before.json perf-results/after.json
 *
 * Trước mỗi lần chụp nên `npm run perf:seed -- --anchor <cùng ngày>` (trang học / tác vụ hằng ngày có ghi dữ liệu).
 * Hàm có tham số `now` dùng mốc 12:00 ngày anchor (giống seed); hàm phía học viên dùng giờ hiện tại → chụp trước / sau trong cùng ngày.
 */
import fs from "node:fs";
import { prisma } from "@/lib/db";
import { vnIsoDate } from "@/lib/format";
import { getAttentionCourses, getCompanyStats, getMonthlyCompletions } from "@/lib/group-dashboard";
import { getContinueLearning, getMyEnrollmentCounts, getMyEnrollments, getMyStats, getTodoEnrollments } from "@/lib/learning";
import {
  certificateReport,
  courseLearners,
  courseReport,
  departmentReport,
  memberReport,
  parseReportFilters,
  resolveReportContext,
  versionReport,
} from "@/lib/reports";
import { getTeamScope, type TeamActor } from "@/lib/scope";
import { getCourseProgress, getMemberRows, getTeamOverview } from "@/lib/team-stats";
import { argOf, assertPerfDatabase } from "./perf/common";

assertPerfDatabase();

/** Chuẩn hoá để so sánh: Map/Set → mảng / object có thứ tự, Date → ISO, khoá object sắp xếp. */
function normalize(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString();
  if (v instanceof Map) {
    const entries: [string, unknown][] = [...v.entries()].map(([k, x]) => [String(k), normalize(x)]);
    return Object.fromEntries(entries.sort(([a], [b]) => (a < b ? -1 : 1)));
  }
  if (v instanceof Set) return [...v].map(normalize);
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v).sort().map((k) => [k, normalize((v as Record<string, unknown>)[k])]));
  }
  if (typeof v === "bigint") return v.toString();
  return v;
}

async function snapshot(anchor: string) {
  const now = new Date(`${anchor}T12:00:00+07:00`);
  const actor = async (code: string): Promise<TeamActor & { code: string }> => {
    const u = await prisma.user.findUniqueOrThrow({ where: { employeeCode: code }, select: { id: true, role: true, companyId: true } });
    return { ...u, code };
  };
  const [ga, ca1, mg1, ln1] = await Promise.all([actor("PERF-GA"), actor("PERF-CA1"), actor("PERF-MG1"), actor("PERF-LN1")]);
  const out: Record<string, unknown> = {};

  // Báo cáo: GA (toàn tập đoàn + lọc CTY1 + lọc danh mục / ngày giao / gồm tự đăng ký), CA1, MG1
  const cases: [string, TeamActor, Record<string, string>][] = [
    ["GA", ga, {}],
    ["GA_CTY1", ga, { company: ca1.companyId }],
    ["GA_filters", ga, { from: vnIsoDate(new Date(now.getTime() - 180 * 86_400_000)), to: anchor, self: "1" }],
    ["CA1", ca1, {}],
    ["MG1", mg1, {}],
    ["MG1_nosub", mg1, { sub: "0" }],
  ];
  for (const [name, a, sp] of cases) {
    const ctx = await resolveReportContext(a, parseReportFilters(sp), prisma, now);
    const courses = await courseReport(ctx);
    const firstCourse = courses[0];
    out[`reports.${name}`] = {
      users: ctx.userIds.length,
      courses,
      departments: await departmentReport(ctx, false),
      departmentsCumulative: await departmentReport(ctx, true),
      members: await memberReport(ctx),
      versions: await versionReport(ctx),
      certificates30: await certificateReport(ctx, "30"),
      certificates60: await certificateReport(ctx, "60"),
      certificates90: await certificateReport(ctx, "90"),
      certificatesExpired: await certificateReport(ctx, "expired"),
      courseLearners: firstCourse ? await courseLearners(ctx, firstCourse.courseId) : null,
    };
  }

  out["groupDashboard"] = {
    companyStats: await getCompanyStats(now),
    monthly: await getMonthlyCompletions(null, now),
    monthlyCty1: await getMonthlyCompletions(ca1.companyId, now),
    attention: await getAttentionCourses(now),
  };

  for (const [name, a] of [["MG1", mg1], ["CA1", ca1], ["GA", ga]] as const) {
    const scope = await getTeamScope(a);
    const rows = await getMemberRows(scope);
    out[`team.${name}`] = {
      overview: await getTeamOverview(scope),
      rows,
      courseProgress: await getCourseProgress(rows.map((r) => r.id), 10, now),
    };
  }

  out["learner.LN1"] = {
    stats: await getMyStats(ln1.id),
    todo: await getTodoEnrollments(ln1.id, 5),
    continue: await getContinueLearning(ln1.id, 3),
    enrollments: await getMyEnrollments(ln1.id),
    counts: await getMyEnrollmentCounts(ln1.id),
  };
  return normalize(out);
}

function diff(a: unknown, b: unknown, path = "$", out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
    return out;
  }
  out.push(`${path}: ${JSON.stringify(a)?.slice(0, 120)} ≠ ${JSON.stringify(b)?.slice(0, 120)}`);
  return out;
}

async function main() {
  const compare = argOf("compare");
  if (compare) {
    const files = process.argv.slice(process.argv.indexOf("--compare") + 1).filter((x) => !x.startsWith("--")).slice(0, 2);
    if (files.length !== 2) throw new Error("Dùng: --compare <trước.json> <sau.json>");
    const [a, b] = files.map((f) => JSON.parse(fs.readFileSync(f, "utf8")));
    const d = diff(a.data, b.data);
    if (d.length === 0) {
      console.log(`✔ GIỐNG HỆT (${Object.keys(a.data).length} nhóm kết quả, ${JSON.stringify(a.data).length.toLocaleString("vi-VN")} ký tự).`);
    } else {
      console.log(`✘ KHÁC NHAU (${d.length}${d.length > 20 ? "+" : ""} chỗ):`);
      for (const line of d) console.log("  " + line);
      process.exitCode = 1;
    }
    return;
  }
  const outFile = argOf("out") ?? "perf-results/snapshot.json";
  const anchor = argOf("anchor") ?? vnIsoDate();
  const t = performance.now();
  const data = await snapshot(anchor);
  fs.mkdirSync(outFile.includes("/") ? outFile.slice(0, outFile.lastIndexOf("/")) : ".", { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify({ anchor, at: new Date().toISOString(), data }, null, 1));
  console.log(`✔ Đã chụp ${Object.keys(data as object).length} nhóm kết quả vào ${outFile} (${((performance.now() - t) / 1000).toFixed(1)} giây).`);
}

main()
  .catch((e) => {
    console.error("✘", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
