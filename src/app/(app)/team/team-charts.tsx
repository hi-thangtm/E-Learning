"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { formatNumber, formatPercent } from "@/lib/format";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

/** Màu theo docs/design-system.md: --chart-1 primary, -2 info, -3 success, -4 warning, -5 error. */
const COURSE_CONFIG = {
  completed: { label: "Hoàn thành", color: "var(--chart-3)" },
  inProgress: { label: "Đang học", color: "var(--chart-1)" },
  notStarted: { label: "Chưa bắt đầu", color: "var(--chart-2)" },
  overdue: { label: "Quá hạn", color: "var(--chart-5)" },
} satisfies ChartConfig;

/** Cắt ngắn nhãn trục (tên đầy đủ ở tooltip) */
const clip = (v: string, max: number) => (v.length > max ? `${v.slice(0, max - 1)}…` : v);

export type CourseChartRow = { code: string; title: string; completed: number; inProgress: number; notStarted: number; overdue: number };

/** Cột chồng theo khoá: Hoàn thành / Đang học / Chưa bắt đầu / Quá hạn. */
export function CourseProgressChart({ data }: { data: CourseChartRow[] }) {
  return (
    <ChartContainer config={COURSE_CONFIG} className="aspect-auto h-80 w-full">
      <BarChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        {/* Mã khoá xoay −30° để không đè nhau (ui-review #56) */}
        <XAxis
          dataKey="code"
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          interval={0}
          angle={-30}
          textAnchor="end"
          height={56}
          tickFormatter={(v: string) => clip(v, 12)}
        />
        <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0]?.payload as CourseChartRow | undefined)?.title ?? ""}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="completed" stackId="s" fill="var(--color-completed)" />
        <Bar dataKey="inProgress" stackId="s" fill="var(--color-inProgress)" />
        <Bar dataKey="notStarted" stackId="s" fill="var(--color-notStarted)" />
        <Bar dataKey="overdue" stackId="s" fill="var(--color-overdue)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartContainer>
  );
}

const DEPT_CONFIG = { rate: { label: "Tỷ lệ hoàn thành (%)", color: "var(--chart-1)" } } satisfies ChartConfig;

export type DepartmentChartRow = { name: string; rate: number; completed: number; assigned: number };

/** Thanh ngang: tỷ lệ hoàn thành khoá được giao theo phòng ban. */
export function DepartmentRateChart({ data }: { data: DepartmentChartRow[] }) {
  return (
    <ChartContainer config={DEPT_CONFIG} className="aspect-auto w-full" style={{ height: Math.max(160, data.length * 44 + 32) }}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 40 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}%`} />
        <YAxis type="category" dataKey="name" width={160} tickLine={false} axisLine={false} tickFormatter={(v: string) => clip(v, 24)} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0]?.payload as DepartmentChartRow | undefined)?.name ?? ""}
              formatter={(value, _name, item) => {
                const row = item.payload as DepartmentChartRow;
                return `${formatPercent(Number(value), 0)} (${formatNumber(row.completed)}/${formatNumber(row.assigned)} lượt học)`;
              }}
            />
          }
        />
        <Bar dataKey="rate" fill="var(--color-rate)" radius={4} barSize={20}>
          <LabelList dataKey="rate" position="right" formatter={(v) => formatPercent(Number(v), 0)} className="fill-foreground text-[12px]" />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
