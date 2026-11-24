"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatPercent } from "@/lib/format";

/** Màu theo docs/design-system.md: --chart-1 primary, -3 success, -4 warning, -5 error. */
const RATE_CONFIG = { rate: { label: "Tỷ lệ hoàn thành (%)", color: "var(--chart-1)" } } satisfies ChartConfig;

export type CompanyRatePoint = { code: string; name: string; rate: number | null };

/** Ngưỡng màu giống bảng so sánh: xanh ≥ 90, vàng 70–89, đỏ < 70. */
function rateColor(rate: number | null): string {
  if (rate === null) return "var(--muted-foreground)";
  return rate >= 90 ? "var(--chart-3)" : rate >= 70 ? "var(--chart-4)" : "var(--chart-5)";
}

/** Cột: tỷ lệ hoàn thành khoá được giao theo công ty. */
export function CompanyRateChart({ data }: { data: CompanyRatePoint[] }) {
  const rows = data.map((d) => ({ ...d, value: d.rate ?? 0 }));
  return (
    <ChartContainer config={RATE_CONFIG} className="aspect-auto h-72 w-full">
      <BarChart data={rows} margin={{ left: -12, right: 8, top: 20 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="code" tickLine={false} axisLine={false} tickMargin={8} interval={0} />
        <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0]?.payload as CompanyRatePoint | undefined)?.name ?? ""}
              formatter={(_, __, item) => {
                const r = (item.payload as CompanyRatePoint).rate;
                return r === null ? "Chưa giao khoá nào" : `${formatPercent(r)} hoàn thành`;
              }}
            />
          }
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
          {rows.map((r) => (
            <Cell key={r.code} fill={rateColor(r.rate)} />
          ))}
          <LabelList dataKey="value" position="top" formatter={(v) => formatPercent(Number(v))} className="fill-foreground text-[12px]" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

const TREND_CONFIG = { completions: { label: "Lượt hoàn thành", color: "var(--chart-3)" } } satisfies ChartConfig;

export type TrendPoint = { label: string; completions: number };

/** Đường: số lượt hoàn thành khoá theo tháng (12 tháng). */
export function CompletionTrendChart({ data }: { data: TrendPoint[] }) {
  return (
    <ChartContainer config={TREND_CONFIG} className="aspect-auto h-72 w-full">
      <LineChart data={data} margin={{ left: -12, right: 12, top: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Line dataKey="completions" type="monotone" stroke="var(--color-completions)" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
      </LineChart>
    </ChartContainer>
  );
}
