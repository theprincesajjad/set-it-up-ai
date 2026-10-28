"use client";
/**
 * Dashboard charts (foundations.md: thin black line or black bars, light grid, no legends
 * unless two series). Every chart can flip to a table.
 */
import { useId, useState, type ReactNode } from "react";
import { Bar, BarChart as RBarChart, CartesianGrid, Line, LineChart as RLineChart, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/primitives/chart";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

export interface SeriesPoint {
  label: string;
  value: number;
  /** Optional comparison (previous period / network), drawn in light grey. */
  compare?: number;
}

function TableView({ rows, valueLabel, compareLabel, format }: { rows: SeriesPoint[]; valueLabel: string; compareLabel?: string; format: (n: number) => string }) {
  return (
    <div className="max-h-72 overflow-auto border-y border-line">
      <table className="w-full text-meta">
        <thead className="sticky top-0 bg-bg-subtle text-caption text-fg-muted">
          <tr>
            <th scope="col" className="h-8 px-3 text-start font-medium">Date</th>
            <th scope="col" className="h-8 px-3 text-end font-medium">{valueLabel}</th>
            {compareLabel ? <th scope="col" className="h-8 px-3 text-end font-medium">{compareLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="h-9 px-3">{r.label}</td>
              <td className="h-9 px-3 text-end tabular">{format(r.value)}</td>
              {compareLabel ? <td className="h-9 px-3 text-end tabular">{r.compare != null ? format(r.compare) : "–"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chart wrapper: title row with a quiet "View as table" toggle. No box (put it inside a Panel if needed). */
export function ChartFrame({ title, subtitle, children, table, action, className, hideTitle }: { title: string; subtitle?: ReactNode; children: ReactNode; table: ReactNode; action?: ReactNode; className?: string; hideTitle?: boolean }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("min-w-0", className)} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div className={cn(hideTitle && "sr-only")}>
          <h3 className="text-body-strong text-fg">{title}</h3>
          {subtitle ? <p className="text-meta text-fg-muted">{subtitle}</p> : null}
        </div>
        <div className="flex w-full items-center justify-between gap-3 whitespace-nowrap sm:ms-auto sm:w-auto sm:justify-end">
          {action}
          <button type="button" onClick={() => setAsTable((v) => !v)} className="ms-auto rounded-sm text-meta text-fg-muted hover:text-fg focus-visible:focus-ring">
            {asTable ? "View as chart" : "View as table"}
          </button>
        </div>
      </div>
      {asTable ? table : children}
    </section>
  );
}

/** Round the axis max up to an even, friendly number so the midline label is whole (4, 6, 8, 10, 20, 40 ...). */
export function niceMax(v: number): number {
  if (v <= 4) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  const step = [1, 1.2, 1.6, 2, 3, 4, 6, 8, 10].find((s) => n <= s) ?? 10;
  const m = Math.round(step * p);
  return m % 2 === 0 ? m : m + 1;
}

function shortDate(label: string): string {
  // "2026-10-21" or "10-21" → "Oct 21"
  const m = /^(?:\d{4}-)?(\d{2})-(\d{2})$/.exec(label);
  if (!m) return label;
  const d = new Date(2026, Number(m[1]) - 1, Number(m[2]));
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

interface PlotProps {
  data: SeriesPoint[];
  format: (n: number) => string;
  height: number;
  kind: "bar" | "line";
  title: string;
  valueLabel: string;
  compareLabel?: string;
}

/**
 * The plot, on shadcn Chart (Recharts 3). Series colours come from `--chart-*` only: the value is `chart-1` (black in light, white in
 * dark), a comparison is `chart-3` (a quiet grey, dashed on a line). `chart-2` (orange) is for the ONE series a page wants noticed and is
 * not used here: no caller highlights a series. Grid and axis text use the chart primitive's `border` and `muted-foreground`.
 */
function Plot({ data, format, height, kind, title, valueLabel, compareLabel }: PlotProps) {
  const id = useId();
  const raw = Math.max(1, ...data.map((d) => Math.max(d.value, d.compare ?? 0)));
  const max = niceMax(raw);
  const total = data.reduce((s, d) => s + d.value, 0);
  const hasCompare = data.some((d) => d.compare != null);
  const config = {
    value: { label: valueLabel, color: "var(--chart-1)" },
    compare: { label: compareLabel ?? "Compared", color: "var(--chart-3)" },
  } satisfies ChartConfig;
  const common = { data, margin: { top: 4, right: 4, bottom: 0, left: 0 } };
  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="2 3" />
      <XAxis dataKey="label" tickFormatter={shortDate} tickLine={false} axisLine={false} tickMargin={6} interval="preserveStartEnd" minTickGap={40} />
      <YAxis width={32} domain={[0, max]} ticks={[0, max / 2, max]} tickFormatter={(v: number) => format(v)} tickLine={false} axisLine={false} />
      <ChartTooltip cursor={kind === "bar" ? { fill: "var(--muted)" } : { stroke: "var(--border)" }} content={<ChartTooltipContent labelFormatter={(l) => shortDate(String(l))} formatter={(v, name) => <span className="flex w-full justify-between gap-3 tabular-nums"><span className="text-muted-foreground">{config[name as "value" | "compare"]?.label ?? name}</span><span className="font-semibold text-foreground">{format(Number(v))}</span></span>} hideIndicator />} />
    </>
  );
  return (
    <figure aria-labelledby={`${id}-cap`} className="relative">
      <figcaption id={`${id}-cap`} className="sr-only">
        {title}: {data.length} days, total {format(total)}, highest {format(raw)}.
      </figcaption>
      <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
        {kind === "bar" ? (
          <RBarChart {...common} accessibilityLayer={false}>
            {axes}
            {hasCompare ? <Bar dataKey="compare" fill="var(--color-compare)" fillOpacity={0.35} radius={[2, 2, 0, 0]} isAnimationActive={false} /> : null}
            <Bar dataKey="value" fill="var(--color-value)" radius={[2, 2, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          </RBarChart>
        ) : (
          <RLineChart {...common} accessibilityLayer={false}>
            {axes}
            {hasCompare ? <Line dataKey="compare" type="monotone" stroke="var(--color-compare)" strokeWidth={1.25} strokeDasharray="3 3" dot={false} isAnimationActive={false} /> : null}
            <Line dataKey="value" type="monotone" stroke="var(--color-value)" strokeWidth={1.75} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
          </RLineChart>
        )}
      </ChartContainer>
    </figure>
  );
}

function EmptyChart({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center border-y border-dashed border-line text-meta text-fg-muted" style={{ height }}>
      Not enough data yet. Check back after a week of visits.
    </div>
  );
}

type ChartProps = { title: string; subtitle?: ReactNode; data: SeriesPoint[]; valueLabel?: string; compareLabel?: string; format?: (n: number) => string; height?: number; action?: ReactNode; className?: string; hideTitle?: boolean };

/** Vertical black bars, optional light-grey comparison bars behind. */
export function BarChart({ title, subtitle, data, valueLabel = "Value", compareLabel, format = formatNumber, height = 180, action, className, hideTitle }: ChartProps) {
  const empty = data.every((d) => d.value === 0 && !d.compare);
  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className} hideTitle={hideTitle} table={<TableView rows={data} valueLabel={valueLabel} compareLabel={compareLabel} format={format} />}>
      {empty ? <EmptyChart height={height} /> : <Plot data={data} format={format} height={height} kind="bar" title={title} valueLabel={valueLabel} compareLabel={compareLabel} />}
    </ChartFrame>
  );
}

/** Thin black line, optional dashed grey comparison line. */
export function LineChart({ title, subtitle, data, valueLabel = "Value", compareLabel, format = formatNumber, height = 180, action, className, hideTitle }: ChartProps) {
  const empty = data.every((d) => d.value === 0 && !d.compare);
  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className} hideTitle={hideTitle} table={<TableView rows={data} valueLabel={valueLabel} compareLabel={compareLabel} format={format} />}>
      {empty ? <EmptyChart height={height} /> : <Plot data={data} format={format} height={height} kind="line" title={title} valueLabel={valueLabel} compareLabel={compareLabel} />}
    </ChartFrame>
  );
}

/** Horizontal bars with direct labels (join sources, overlap by shop, per-merchant visits). Thin chart-1 bars on a light track. */
export function HBarList({ rows, format = formatNumber, max: maxProp }: { rows: { label: ReactNode; value: number; key: string; hint?: string }[]; format?: (n: number) => string; max?: number; tone?: string }) {
  const max = maxProp ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-meta">
            <span className="min-w-0 truncate text-fg">{r.label}</span>
            <span className="shrink-0 text-fg tabular">
              {format(r.value)}
              {r.hint ? <span className="text-fg-muted"> · {r.hint}</span> : null}
            </span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-muted" aria-hidden>
            <div className="h-full rounded-full bg-chart-1" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Visits by weekday: seven small bars (chart-1) with the count above. */
export function WeekdayBars({ counts, format = formatNumber }: { counts: number[]; format?: (n: number) => string }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(1, ...counts);
  return (
    <div className="grid grid-cols-7 gap-3" role="list" aria-label="Visits by weekday">
      {days.map((d, i) => {
        const v = counts[i] ?? 0;
        return (
          <div key={d} role="listitem" className="flex flex-col items-center gap-1.5">
            <span className="text-caption font-normal text-fg tabular">{format(v)}</span>
            <div className="flex h-16 w-full items-end justify-center border-b border-line">
              <div className="w-3/5 max-w-6 rounded-t-xs bg-chart-1" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
            </div>
            <span className="text-caption font-normal text-fg-muted">{d}</span>
          </div>
        );
      })}
    </div>
  );
}
