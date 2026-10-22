"use client";
import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { formatNumber } from "@/lib/format";

export interface SeriesPoint {
  label: string;
  value: number;
  /** Optional comparison (previous period / network), drawn in stone. */
  compare?: number;
}

function TableView({ rows, valueLabel, compareLabel, format }: { rows: SeriesPoint[]; valueLabel: string; compareLabel?: string; format: (n: number) => string }) {
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-border">
      <table className="w-full text-body-sm">
        <thead className="sticky top-0 bg-surface-sunken text-label text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-2 text-start">Date</th>
            <th scope="col" className="px-3 py-2 text-end">{valueLabel}</th>
            {compareLabel ? <th scope="col" className="px-3 py-2 text-end">{compareLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="px-3 py-1.5">{r.label}</td>
              <td className="px-3 py-1.5 text-end tabular-nums">{format(r.value)}</td>
              {compareLabel ? <td className="px-3 py-1.5 text-end tabular-nums">{r.compare != null ? format(r.compare) : "–"}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Chart card wrapper with the "View as table" toggle every chart needs (system.md Chart colours). */
export function ChartFrame({ title, subtitle, children, table, action, className }: { title: string; subtitle?: ReactNode; children: ReactNode; table: ReactNode; action?: ReactNode; className?: string }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("rounded-lg bg-surface p-4 shadow-sm md:p-5", className)} aria-label={title}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-title text-fg">{title}</h3>
          {subtitle ? <p className="text-body-sm text-fg-muted">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {action}
          <button type="button" onClick={() => setAsTable((v) => !v)} className="min-h-11 rounded-sm px-2 text-label text-fg-link underline-offset-2 hover:underline focus-visible:focus-ring">
            {asTable ? "View as chart" : "View as table"}
          </button>
        </div>
      </div>
      {asTable ? table : children}
    </section>
  );
}

/** Vertical bars (series 1), optional stone comparison bars behind. Direct labels for max + last. */
export function BarChart({ title, subtitle, data, valueLabel = "Value", compareLabel, format = formatNumber, height = 180, action, className }: { title: string; subtitle?: ReactNode; data: SeriesPoint[]; valueLabel?: string; compareLabel?: string; format?: (n: number) => string; height?: number; action?: ReactNode; className?: string }) {
  const id = useId();
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.compare ?? 0)));
  const w = Math.max(data.length * 12, 240);
  const bw = w / Math.max(1, data.length);
  const empty = data.every((d) => d.value === 0 && !d.compare);
  return (
    <ChartFrame title={title} subtitle={subtitle} action={action} className={className} table={<TableView rows={data} valueLabel={valueLabel} compareLabel={compareLabel} format={format} />}>
      {empty ? (
        <p className="flex items-center justify-center rounded-md bg-canvas-subtle text-body-sm text-fg-muted" style={{ height }}>
          Not enough data yet. Check back after a week of visits.
        </p>
      ) : (
        <figure aria-labelledby={`${id}-cap`}>
          <figcaption id={`${id}-cap`} className="sr-only">
            {title}: {data.length} bars, highest {format(max)}.
          </figcaption>
          <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} aria-hidden>
            {[0.25, 0.5, 0.75].map((g) => (
              <line key={g} x1={0} x2={w} y1={height * g} y2={height * g} className="stroke-chart-grid" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {data.map((d, i) => {
              const h = (d.value / max) * (height - 8);
              const ch = d.compare != null ? (d.compare / max) * (height - 8) : 0;
              return (
                <g key={d.label}>
                  {d.compare != null ? <rect x={i * bw + bw * 0.1} y={height - ch} width={bw * 0.8} height={ch} rx={2} className="fill-chart-network opacity-40" /> : null}
                  <rect x={i * bw + bw * 0.2} y={height - h} width={bw * 0.6} height={Math.max(h, d.value > 0 ? 1 : 0)} rx={2} className="fill-chart-1">
                    <title>{`${d.label}: ${format(d.value)}`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
          <div className="mt-1 flex justify-between text-caption text-fg-muted">
            <span>{data[0]?.label}</span>
            <span>{data[data.length - 1]?.label}</span>
          </div>
        </figure>
      )}
    </ChartFrame>
  );
}

/** Horizontal bars with direct labels (join sources, overlap by shop, per-merchant visits). */
export function HBarList({ rows, format = formatNumber, max: maxProp, tone = "chart-1" }: { rows: { label: ReactNode; value: number; key: string; hint?: string }[]; format?: (n: number) => string; max?: number; tone?: "chart-1" | "chart-network" | "chart-3" }) {
  const max = maxProp ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="min-w-0 truncate text-fg">{r.label}</span>
            <span className="shrink-0 tabular-nums text-fg">{format(r.value)}{r.hint ? <span className="text-fg-muted"> · {r.hint}</span> : null}</span>
          </div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-ring-track" aria-hidden>
            <div className={cn("h-full rounded-full", tone === "chart-network" ? "bg-chart-network" : tone === "chart-3" ? "bg-chart-3" : "bg-chart-1")} style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Day x hour heat strip (sequential pine) for weekday patterns. */
export function WeekdayBars({ counts, format = formatNumber }: { counts: number[]; format?: (n: number) => string }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const max = Math.max(1, ...counts);
  return (
    <div className="grid grid-cols-7 gap-2" role="list" aria-label="Visits by weekday">
      {days.map((d, i) => {
        const v = counts[i] ?? 0;
        const level = Math.ceil((v / max) * 4);
        return (
          <div key={d} role="listitem" className="flex flex-col items-center gap-1">
            <div className={cn("flex h-14 w-full items-end justify-center rounded-sm", ["bg-surface-sunken", "bg-chart-seq-2", "bg-chart-seq-4", "bg-chart-seq-6", "bg-chart-seq-8"][level])}>
              <span className={cn("pb-1 text-caption tabular-nums", level >= 3 ? "text-fg-inverse" : "text-fg")}>{format(v)}</span>
            </div>
            <span className="text-caption text-fg-muted">{d}</span>
          </div>
        );
      })}
    </div>
  );
}
