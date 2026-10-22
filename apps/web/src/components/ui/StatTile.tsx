import { TrendingDown, TrendingUp } from "lucide-react";
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
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const w = 100;
  const h = 32;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * h}`).join(" ");
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="mt-2 h-8 w-full">
      <polyline points={pts} fill="none" strokeWidth={2} vectorEffect="non-scaling-stroke" className="stroke-chart-you" />
    </svg>
  );
}

/** KPI tile (system.md §6 StatTile) for the merchant dashboard, rep console and admin. */
export function StatTile({ label, value, delta, spark, href, loading, caption }: StatTileProps) {
  const body = (
    <>
      <p className="text-overline uppercase text-fg-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="mt-1 text-stat tabular-nums text-fg">{value ?? "–"}</p>}
      {delta && !loading ? (
        <p className={cn("mt-1 flex items-center gap-1 text-body-sm", delta.good === true ? "text-success" : delta.good === false ? "text-danger" : "text-fg-muted")}>
          {delta.pct >= 0 ? <TrendingUp aria-hidden className="size-4" /> : <TrendingDown aria-hidden className="size-4" />}
          {delta.text ?? `${delta.pct >= 0 ? "+" : ""}${delta.pct}%`}
        </p>
      ) : null}
      {caption ? <p className="mt-1 text-caption text-fg-muted">{caption}</p> : null}
      {spark && !loading ? <Sparkline values={spark} /> : null}
    </>
  );
  const cls = "block rounded-lg bg-surface p-4 shadow-sm md:p-5";
  return href ? (
    <Link href={href} className={cn(cls, "transition-shadow hover:shadow-md focus-visible:focus-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
