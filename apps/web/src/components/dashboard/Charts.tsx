"use client";
/**
 * Dashboard charts (foundations.md: thin black line or black bars, light grid, no legends
 * unless two series). Every chart can flip to a table.
 */
import { useId, useState, type ReactNode } from "react";
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
          <button type="button" onClick={() => setAsTable((v) => !v)} className="rounded-sm text-meta text-fg-muted hover:text-fg focus-visible:focus-ring">
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
}

function Plot({ data, format, height, kind, title }: PlotProps) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const raw = Math.max(1, ...data.map((d) => Math.max(d.value, d.compare ?? 0)));
  const max = niceMax(raw);
  const W = 600;
  const H = height;
  const n = Math.max(1, data.length);
  const bw = W / n;
  const y = (v: number) => H - (v / max) * (H - 4);
  const x = (i: number) => (kind === "bar" ? i * bw + bw / 2 : n === 1 ? W / 2 : (i / (n - 1)) * W);
  const line = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const cmp = data.some((d) => d.compare != null) ? data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.compare ?? 0).toFixed(1)}`).join(" ") : null;
  const h = hover != null ? data[hover] : null;
  const total = data.reduce((s, d) => s + d.value, 0);
  return (
    <figure aria-labelledby={`${id}-cap`} className="relative" onPointerLeave={() => setHover(null)}>
      <figcaption id={`${id}-cap`} className="sr-only">
        {title}: {data.length} days, total {format(total)}, highest {format(raw)}.
      </figcaption>
      <div className="flex gap-3">
        <div aria-hidden className="flex w-6 shrink-0 flex-col justify-between text-end text-caption font-normal text-fg-subtle tabular" style={{ height: H }}>
          <span className="-mt-1.5">{format(max)}</span>
          <span>{format(max / 2)}</span>
          <span className="-mb-1.5">0</span>
        </div>
        <div className="relative min-w-0 flex-1">
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block w-full overflow-visible" style={{ height: H }} aria-hidden onMouseLeave={() => setHover(null)}>
            {[0, 0.5, 1].map((g) => (
              <line key={g} x1={0} x2={W} y1={g * H} y2={g * H} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" strokeDasharray={g === 1 ? undefined : "2 3"} />
            ))}
            {kind === "bar"
              ? data.map((d, i) => {
                  const bh = H - y(d.value);
                  return (
                    <g key={d.label}>
                      {d.compare != null ? <rect x={i * bw + bw * 0.15} y={y(d.compare)} width={bw * 0.7} height={H - y(d.compare)} className="fill-bg-muted" /> : null}
                      <rect x={i * bw + bw * 0.22} y={H - Math.max(bh, d.value > 0 ? 1.5 : 0)} width={bw * 0.56} height={Math.max(bh, d.value > 0 ? 1.5 : 0)} rx={1.5} className={hover === i ? "fill-fg" : "fill-fg opacity-90"} />
                      <rect x={i * bw} y={0} width={bw} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
                    </g>
                  );
                })
              : (
                <>
                  {cmp ? <path d={cmp} fill="none" className="stroke-fg-subtle" strokeWidth={1.25} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" /> : null}
                  <path d={line} fill="none" className="stroke-fg" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                  {hover != null ? <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} className="stroke-line-strong" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
                  {data.map((d, i) => (
                    <rect key={d.label} x={x(i) - W / n / 2} y={0} width={W / n} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
                  ))}
                </>
              )}
          </svg>
          {kind === "line" && hover != null && h ? (
            <span aria-hidden className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-fg" style={{ left: `${(x(hover) / W) * 100}%`, top: y(h.value) }} />
          ) : null}
          {h ? (
            <div aria-hidden className="pointer-events-none absolute top-0 z-[1] -translate-x-1/2 whitespace-nowrap rounded-[8px] border border-line bg-bg px-2 py-1 text-caption shadow-float" style={{ left: `${Math.min(92, Math.max(8, (x(hover!) / W) * 100))}%` }}>
              <span className="text-fg-muted">{shortDate(h.label)}</span> <span className="font-semibold text-fg tabular">{format(h.value)}</span>
              {h.compare != null ? <span className="text-fg-muted tabular"> · {format(h.compare)}</span> : null}
            </div>
          ) : null}
          <div aria-hidden className="mt-1.5 flex justify-between text-caption font-normal text-fg-subtle">
            <span>{data[0] ? shortDate(data[0].label) : ""}</span>
            {data.length > 6 ? <span>{shortDate(data[Math.floor(data.length / 2)]!.label)}</span> : null}
            <span>{data.length > 1 ? shortDate(data[data.length - 1]!.label) : ""}</span>
          </div>
        </div>
      </div>
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
      {empty ? <EmptyChart height={height} /> : <Plot data={data} format={format} height={height} kind="bar" title={title} />}
    </ChartFrame>
  );
}

/** Thin black line, optional dashed grey comparison line. */
export function LineChart({ title, subtitle, data, valueLabel = "Value", compareLabel, format = formatNumber, height = 180, action, className, hideTitle }: ChartProps) {
  const empty = data.every((d) => d.value === 0 && !d.compare);
  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className} hideTitle={hideTitle} table={<TableView rows={data} valueLabel={valueLabel} compareLabel={compareLabel} format={format} />}>
      {empty ? <EmptyChart height={height} /> : <Plot data={data} format={format} height={height} kind="line" title={title} />}
    </ChartFrame>
  );
}

/** Horizontal bars with direct labels (join sources, overlap by shop, per-merchant visits). Thin black bars on a light track. */
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
            <div className="h-full rounded-full bg-fg" style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Visits by weekday: seven small black bars with the count above. */
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
              <div className="w-3/5 max-w-6 rounded-t-[2px] bg-fg" style={{ height: `${Math.max(2, (v / max) * 100)}%` }} />
            </div>
            <span className="text-caption font-normal text-fg-muted">{d}</span>
          </div>
        );
      })}
    </div>
  );
}
