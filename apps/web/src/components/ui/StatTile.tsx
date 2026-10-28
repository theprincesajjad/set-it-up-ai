import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Skeleton } from "./Skeleton";
import { Sparkline } from "./Sparkline";
import { TONE_HOVER, TONE_SURFACE, type Tone } from "./tones";

export interface StatTileProps {
  label: string;
  value: ReactNode;
  /** e.g. { pct: 12, good: true, text: "+12% vs last 30 days" }. `good` decides the colour on a plain tile; on a toned tile it decides the arrow. */
  delta?: { pct: number; good?: boolean | null; text?: string } | null;
  /** Optional sparkline values (a plain tile draws it under the numbers; a toned tile draws it at the end of the number). */
  spark?: number[];
  href?: string;
  loading?: boolean;
  caption?: ReactNode;
  /** "card" (hairline block, default) or "plain" (inside a bordered stats row with vertical hairlines). Ignored when `tone` is set. */
  frame?: "card" | "plain";
  /** A pastel tile: peach, mint, butter, lilac, sky, rose, or `trade` (the shop's accent family). The number is big Fraunces in the tone's deep colour. */
  tone?: Tone;
}

/**
 * KPI. Plain (no `tone`): label above, plain number, a small delta below, a hairline card. Toned (Main Street Warm): a pastel rounded tile with
 * the label, a big Fraunces number, a delta line (arrow + words) and an optional sparkline from `spark`.
 */
export function StatTile({ label, value, delta, spark, href, loading, caption, frame = "card", tone }: StatTileProps) {
  if (tone) return <ToneTile {...{ label, value, delta, spark, href, loading, caption, tone }} />;
  const body = (
    <>
      <p className="text-meta text-fg-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-24" /> : <p className="display mt-1 text-stat tabular-nums text-fg">{value ?? "–"}</p>}
      {delta && !loading ? (
        <p className={cn("mt-1 text-meta tabular-nums", delta.good === true ? "text-positive-text" : delta.good === false ? "text-negative" : "text-fg-muted")}>{delta.text ?? `${delta.pct >= 0 ? "+" : ""}${delta.pct}%`}</p>
      ) : null}
      {caption ? <p className="mt-1 text-meta text-fg-muted">{caption}</p> : null}
      {spark && !loading ? <Sparkline values={spark} area={false} className="mt-3 h-7 w-full text-fg" strokeWidth={1.5} /> : null}
    </>
  );
  const cls = cn("block p-4 md:p-5", frame === "card" && "rounded-card border border-line bg-card shadow-card");
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:bg-bg-subtle focus-visible:focus-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function ToneTile({ label, value, delta, spark, href, loading, caption, tone }: Required<Pick<StatTileProps, "tone">> & Omit<StatTileProps, "tone" | "frame">) {
  const text = delta ? (delta.text ?? `${delta.pct >= 0 ? "+" : ""}${delta.pct}%`) : null;
  const Arrow = delta && delta.pct < 0 ? ArrowDown : ArrowUp;
  const showArrow = !!delta && delta.pct !== 0 && delta.good !== null && delta.good !== undefined;
  const body = (
    <>
      <p className="text-meta-strong opacity-90">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        {loading ? <Skeleton className="h-10 w-20" /> : <p className="font-display text-[clamp(30px,4vw,46px)] font-extrabold leading-none tracking-[-0.02em] tabular-nums">{value ?? "–"}</p>}
        {spark && !loading ? <Sparkline values={spark} className="mb-1 h-8 w-14 shrink-0 opacity-90 sm:w-20 md:w-24" /> : null}
      </div>
      <p className="mt-2.5 flex min-h-4 items-center gap-1 text-meta-strong tabular-nums">
        {!loading && text ? (
          <>
            {showArrow ? <Arrow aria-hidden className="size-3.5 shrink-0" strokeWidth={2.5} /> : null}
            <span>{text}</span>
          </>
        ) : !loading && caption ? (
          <span>{caption}</span>
        ) : (
          <span aria-hidden>&nbsp;</span>
        )}
      </p>
    </>
  );
  const cls = cn("relative block min-w-0 overflow-hidden rounded-tile p-4 md:p-5", TONE_SURFACE[tone]);
  return href ? (
    <Link href={href} className={cn(cls, TONE_HOVER, "focus-visible:focus-ring")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
