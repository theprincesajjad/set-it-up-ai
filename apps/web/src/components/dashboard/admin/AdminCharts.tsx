"use client";
/**
 * Admin trend charts (wave Q, team admin) on shadcn Chart (Recharts 3, components/primitives/chart): an area chart with a soft gradient
 * under the line (Stripe Dashboard style), the period total and the change in the header, a hover / keyboard tooltip with the exact value,
 * and the same "View as table" switch as the dashboard charts (components/dashboard/Charts.tsx `ChartFrame`).
 *
 * The series is `--trade` (the console accent); a comparison series is `--chart-3`, dashed. Grid and axis text come from the primitive.
 * No animation on draw (it reads as a loading flash and ignores reduced motion).
 */
import { useId, type ReactNode } from "react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/primitives/chart";
import { ChartFrame, niceMax, type SeriesPoint } from "@/components/dashboard/Charts";
import { DeltaChip, type KpiDelta } from "@/components/dashboard/admin/AdminKit";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

function TrendTable({ rows, valueLabel, format, periodLabel }: { rows: SeriesPoint[]; valueLabel: string; format: (n: number) => string; periodLabel: string }) {
  return (
    <div className="max-h-72 overflow-auto border-y border-line">
      <table className="w-full text-meta">
        <thead className="sticky top-0 bg-bg-subtle text-caption text-fg-muted">
          <tr>
            <th scope="col" className="h-8 px-3 text-start font-medium">{periodLabel}</th>
            <th scope="col" className="h-8 px-3 text-end font-medium">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="h-9 px-3">{r.label}</td>
              <td className="h-9 px-3 text-end tabular">{format(r.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface TrendChartProps {
  title: string;
  subtitle?: ReactNode;
  data: SeriesPoint[];
  valueLabel?: string;
  /** Axis and tooltip format. */
  format?: (n: number) => string;
  /** The headline over the chart (the period total or the latest value), with an optional change chip. */
  headline?: ReactNode;
  delta?: KpiDelta | null;
  height?: number;
  action?: ReactNode;
  className?: string;
  /** The first column of the table view ("Week", "Hour"). */
  periodLabel?: string;
}

/** An area trend with the headline number, the change and a tooltip. Empty data shows one plain sentence instead of a flat line. */
export function TrendChart({ title, subtitle, data, valueLabel = "Value", format = formatNumber, headline, delta, height = 200, action, className, periodLabel = "Week" }: TrendChartProps) {
  const id = useId().replace(/:/g, "");
  const empty = data.every((d) => d.value === 0);
  const raw = Math.max(1, ...data.map((d) => d.value));
  const max = niceMax(raw);
  const axisWidth = Math.max(32, Math.max(...[0, max / 2, max].map((v) => format(v).length)) * 7 + 8);
  const config = { value: { label: valueLabel, color: "var(--trade)" } } satisfies ChartConfig;
  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className} table={<TrendTable rows={data} valueLabel={valueLabel} format={format} periodLabel={periodLabel} />}>
      {headline != null || delta ? (
        <div className="-mt-1 mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
          {headline != null ? <span className="text-[22px] font-[650] leading-7 tracking-[-0.02em] tabular-nums text-fg">{headline}</span> : null}
          {delta ? <DeltaChip delta={delta} /> : null}
        </div>
      ) : null}
      {empty ? (
        <div className="flex items-center justify-center rounded-r4 border border-dashed border-line text-meta text-fg-muted" style={{ height }}>
          Nothing recorded in these weeks yet.
        </div>
      ) : (
        <figure className="relative" aria-label={`${title}: ${data.length} points, highest ${format(raw)}`}>
          <ChartContainer config={config} className={cn("aspect-auto w-full")} style={{ height }}>
            <AreaChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 0 }} accessibilityLayer>
              <defs>
                <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-value)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--color-value)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="2 3" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="preserveStartEnd" minTickGap={36} />
              <YAxis width={axisWidth} domain={[0, max]} ticks={[0, max / 2, max]} tickFormatter={(v: number) => format(v)} tickLine={false} axisLine={false} />
              <ChartTooltip
                cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
                content={
                  <ChartTooltipContent
                    indicator="dot"
                    formatter={(v) => (
                      <span className="flex w-full items-center justify-between gap-4 tabular-nums">
                        <span className="text-muted-foreground">{valueLabel}</span>
                        <span className="font-semibold text-foreground">{format(Number(v))}</span>
                      </span>
                    )}
                  />
                }
              />
              <Area dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={2} fill={`url(#fill-${id})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }} isAnimationActive={false} />
            </AreaChart>
          </ChartContainer>
        </figure>
      )}
    </ChartFrame>
  );
}
