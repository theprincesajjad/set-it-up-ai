import Link from "next/link";
import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";

export interface StatTileProps {
  label: string;
  value: string | number | null;
  /** e.g. { pct: 12, good: true, text: "+12% vs last 30 days" }. `good` decides the colour. */
  delta?: { pct: number; good?: boolean | null; text?: string } | null;
  /** Optional sparkline values. */
  spark?: number[];
  href?: string;
  loading?: boolean;
  caption?: string;
  /** "card" (hairline block, default) or "plain" (inside a bordered stats row with vertical hairlines). */
  frame?: "card" | "plain";
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 100;
  const h = 28;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-3 h-7 w-full">
      <polyline points={pts} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-fg" />
    </svg>
  );
}

/** KPI (foundations.md "Stats"): label above, plain number, a small delta below. No coloured cards, no trend icons. */
export function StatTile({ label, value, delta, spark, href, loading, caption, frame = "card" }: StatTileProps) {
  const body = (
    <>
      <p className="text-meta text-fg-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="display mt-1 text-stat tabular-nums text-fg">{value ?? "–"}</p>}
      {delta && !loading ? (
        <p className={cn("mt-1 text-meta tabular-nums", delta.good === true ? "text-positive-text" : delta.good === false ? "text-negative" : "text-fg-muted")}>{delta.text ?? `${delta.pct >= 0 ? "+" : ""}${delta.pct}%`}</p>
      ) : null}
      {caption ? <p className="mt-1 text-meta text-fg-muted">{caption}</p> : null}
      {spark && !loading ? <Sparkline values={spark} /> : null}
    </>
  );
  const cls = cn("block p-4 md:p-5", frame === "card" && "rounded-card border border-line bg-bg");
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-bg-subtle focus-visible:focus-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
