"use client";
/**
 * Founder admin and rep console building blocks (wave Q, team admin), on the kit (scratchpad/wave-q/kit.md): Stripe-style KPI tiles with a
 * rolling number (AnimatedNumber / NumberFlow), a delta chip and an area sparkline; a health status pill; a quota meter on the Base UI Meter
 * (coss); the conversion funnel with the drop-off between steps; and the small empty state used inside panels.
 *
 * Admin pages are English only (like the rest of /admin). Colours are tokens only: the series and fills use `trade` (the console's accent),
 * good / bad use success / destructive, and a quota close to its cap uses warning. Every piece works without motion (NumberFlow and the
 * meter transition honour prefers-reduced-motion) and keeps 44 px targets where it is a link.
 */
import { ArrowDownRight, ArrowUpRight, Check, Inbox, Minus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Format } from "@number-flow/react";
import { Meter as MeterRoot, MeterIndicator, MeterTrack } from "@/components/primitives/meter";
import { Stepper, StepperIndicator, StepperItem, StepperSeparator, StepperTitle } from "@/components/primitives/stepper";
import { AnimatedNumber } from "@/components/ui/AnimatedNumber";
import { Skeleton } from "@/components/ui/Skeleton";
import { Sparkline } from "@/components/ui/Sparkline";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* KPI tiles                                                                                                                             */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

export interface KpiDelta {
  /** "+12%", "New". */
  text: string;
  /** true = good (success), false = bad (destructive), null = neutral. */
  good: boolean | null;
  /** "vs last week": shown after the chip from sm. */
  context?: string;
  /** Direction of the arrow; defaults from the sign of `text`. */
  dir?: "up" | "down" | "flat";
}

export interface KpiItem {
  label: string;
  /** The text value (fallback, and what is shown when `num` is not set). */
  value: ReactNode;
  /** The number to roll in. Money: pass dollars with `format={{ style: "currency", currency: "CAD" }}`. */
  num?: number;
  format?: Format;
  prefix?: string;
  suffix?: string;
  delta?: KpiDelta | null;
  caption?: ReactNode;
  /** Weekly values, oldest first: an area sparkline under the number. */
  spark?: number[];
  href?: string;
  /** A small dot before the label: something needs a look. */
  alert?: "negative" | "warning";
  /** The tile is the filter in use (a ring and aria-current). */
  active?: boolean;
}

const dirOf = (d: KpiDelta) => d.dir ?? (/^\s*[-−]/.test(d.text) ? "down" : /^\s*\+/.test(d.text) ? "up" : "flat");

/** The delta as a chip: arrow and text on success-soft / destructive-soft / muted, with the comparison after it. */
export function DeltaChip({ delta, className }: { delta: KpiDelta; className?: string }) {
  const dir = dirOf(delta);
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs leading-4", className)}>
      <span
        data-good={delta.good === null ? "neutral" : delta.good ? "yes" : "no"}
        className={cn(
          "inline-flex h-5 shrink-0 items-center gap-0.5 rounded-r4 px-1.5 font-semibold tabular-nums",
          delta.good === true ? "bg-success-soft text-success-text" : delta.good === false ? "bg-destructive-soft text-destructive-text" : "bg-muted text-foreground",
        )}
      >
        <Icon aria-hidden className="size-3.5" strokeWidth={2.5} />
        {delta.text}
      </span>
      {delta.context ? <span className="truncate text-muted-foreground">{delta.context}</span> : null}
    </span>
  );
}

/**
 * One KPI: label, a rolling number, a delta chip or caption, and an optional area sparkline. The whole tile is the link. With `dl` the tile
 * is a description-list group (label in a <dt>, the rest in <dd>s) and the link stretches from inside the <dt>.
 */
export function KpiTile({ item, loading, size = "md", dl, className }: { item: KpiItem; loading?: boolean; size?: "md" | "sm"; dl?: boolean; className?: string }) {
  const s = item;
  const L = dl ? "dt" : "span";
  const V = dl ? "dd" : "span";
  const labelInner = (
    <>
      {s.alert ? <span aria-hidden className={cn("size-1.5 shrink-0 translate-y-[-1px] self-center rounded-full", s.alert === "negative" ? "bg-destructive" : "bg-warning")} /> : null}
      <span className="line-clamp-2">{s.label}</span>
    </>
  );
  const body = (
    <>
      <L className="flex min-h-5 items-baseline gap-1.5 text-[13px] font-[550] leading-5 text-muted-foreground">
        {dl && s.href ? (
          <Link href={s.href} className="flex min-w-0 items-center gap-1.5 after:absolute after:inset-0 after:rounded-r6 focus-visible:outline-none focus-visible:after:focus-ring">
            {labelInner}
          </Link>
        ) : (
          labelInner
        )}
      </L>
      <V className={cn("mt-1 block font-[650] tabular-nums tracking-[-0.03em] text-foreground", size === "sm" ? "text-[22px] leading-7" : "text-[28px] leading-9 lg:text-[32px] lg:leading-10")}>
        {loading ? <Skeleton className={cn("inline-block align-middle", size === "sm" ? "h-6 w-16" : "h-8 w-24")} /> : s.num != null ? <AnimatedNumber value={s.num} format={s.format} prefix={s.prefix} suffix={s.suffix} /> : s.value}
      </V>
      <V className="mt-1.5 flex min-h-5 min-w-0 items-center text-xs leading-4 text-muted-foreground">
        {loading ? <Skeleton className="h-3 w-24" /> : s.delta ? <DeltaChip delta={s.delta} /> : s.caption ? <span className="line-clamp-2">{s.caption}</span> : <span aria-hidden>&nbsp;</span>}
      </V>
      {s.delta && s.caption && !loading ? <V className="mt-1 block truncate text-xs leading-4 text-muted-foreground">{s.caption}</V> : null}
      {s.spark && !loading ? (
        <span className="mt-3 block h-10 text-trade" aria-hidden>
          <Sparkline values={s.spark} className="h-10 w-full" strokeWidth={1.75} />
        </span>
      ) : null}
    </>
  );
  const cls = cn(
    "kpi-tile group/kpi relative flex min-w-0 flex-col rounded-r6 bg-card p-4 text-start shadow-[inset_0_0_0_1px_var(--border),var(--ll-shadow-card)] md:p-5",
    s.href && "transition-[background-color,box-shadow] hover:bg-accent/40",
    s.href && !dl && "focus-visible:focus-ring",
    s.active && "bg-accent/40 shadow-[inset_0_0_0_2px_var(--trade),var(--ll-shadow-card)]",
    className,
  );
  return s.href && !dl ? (
    <Link href={s.href} className={cls} aria-current={s.active ? "true" : undefined}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

/**
 * A row of KPI tiles (2 across on phones, `cols` from lg). `role=group` with the label, like the dashboard's stat blocks; with `dl` it is
 * a description list (each tile one <dt>/<dd> group), for pages whose readers and tests treat the numbers as terms.
 */
export function KpiGrid({ items, label, loading, cols = 4, size, className, dl }: { items: KpiItem[]; label: string; loading?: boolean; cols?: 2 | 3 | 4 | 5; size?: "md" | "sm"; className?: string; dl?: boolean }) {
  const lg = { 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" }[cols];
  // An odd last tile spans both phone columns so the grid has no hole.
  const cells = items.map((s, i) => {
    const span = i === items.length - 1 && items.length % 2 === 1 && "col-span-2 lg:col-span-1";
    // In a description list the tile is itself the dt/dd group, a direct child of the <dl> (a wrapper div would break the list semantics).
    return dl ? (
      <KpiTile key={s.label} item={s} loading={loading} size={size} dl className={cn("min-w-0", span)} />
    ) : (
      <div key={s.label} className={cn("flex min-w-0 [&>*]:flex-1", span)}>
        <KpiTile item={s} loading={loading} size={size} />
      </div>
    );
  });
  const cls = cn("grid grid-cols-2 gap-3 md:gap-4", lg, className);
  return dl ? (
    <dl aria-label={label} aria-busy={loading || undefined} className={cls}>
      {cells}
    </dl>
  ) : (
    <div role="group" aria-label={label} aria-busy={loading || undefined} className={cls}>
      {cells}
    </div>
  );
}

/** Cents to whole dollars for AnimatedNumber with a CAD currency format (cents shown below $1,000). */
export const moneyNum = (cents: number) => ({ num: cents / 100, format: { style: "currency", currency: "CAD", maximumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2, minimumFractionDigits: Math.abs(cents) >= 100_000 ? 0 : 2 } satisfies Format });
/** A rate (0..1) for AnimatedNumber as a percent with one decimal. */
export const pctNum = (rate: number) => ({ num: rate, format: { style: "percent", maximumFractionDigits: 1 } satisfies Format });

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* Status                                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

export type HealthTone = "ok" | "warn" | "down" | "info" | "neutral";
const HEALTH: Record<HealthTone, { pill: string; dot: string }> = {
  ok: { pill: "bg-success-soft text-success-text", dot: "bg-success" },
  warn: { pill: "bg-warning-soft text-warning-text", dot: "bg-warning" },
  down: { pill: "bg-destructive-soft text-destructive-text", dot: "bg-destructive" },
  info: { pill: "bg-info-soft text-info-text", dot: "bg-info" },
  neutral: { pill: "bg-muted text-muted-foreground", dot: "bg-fg-subtle" },
};

/**
 * A status pill with a dot ("API healthy", "Connected", "Payment failed"). `live` adds a soft ping around the dot (off under reduced
 * motion) for a system that is up right now.
 */
export function HealthPill({ tone, children, live, className, size = "md" }: { tone: HealthTone; children: ReactNode; live?: boolean; className?: string; size?: "sm" | "md" }) {
  const t = HEALTH[tone];
  return (
    <span data-tone={tone} className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold", size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-xs", t.pill, className)}>
      <span aria-hidden className="relative flex size-1.5">
        {live ? <span className={cn("absolute inline-flex size-full animate-ping rounded-full opacity-60 motion-reduce:hidden", t.dot)} /> : null}
        <span className={cn("relative inline-flex size-1.5 rounded-full", t.dot)} />
      </span>
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* Quota meter                                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

/**
 * A quota or a cap ("$12.40 of $50", "41 of 100 drafts") on the Base UI Meter (role=meter, aria-valuenow / max). The fill turns warning at
 * `warnAt` of the max and destructive at the max (`levels={false}` for progress toward a target: always the accent). `valueText` is the readable amount shown on the right and read by screen readers.
 */
export function UsageMeter({ label, value, max, valueText, caption, warnAt = 0.8, levels = true, size = "md", hideLabel, className }: { label: string; value: number; max: number; valueText?: string; caption?: ReactNode; warnAt?: number; /** false: progress toward a target (always the accent, never warning or over). */ levels?: boolean; size?: "sm" | "md"; hideLabel?: boolean; className?: string }) {
  const ratio = max > 0 ? value / max : 0;
  const level = !levels ? "ok" : max <= 0 ? "off" : ratio >= 1 ? "over" : ratio >= warnAt ? "warn" : "ok";
  const text = valueText ?? `${formatNumber(value)} of ${formatNumber(max)}`;
  return (
    <MeterRoot value={Math.min(value, Math.max(max, 0))} min={0} max={Math.max(max, 1)} aria-label={label} aria-valuetext={text} className={cn("gap-1.5", className)} data-level={level}>
      {!hideLabel ? (
        <span className="flex items-baseline justify-between gap-3 text-meta">
          <span className="min-w-0 truncate text-fg">{label}</span>
          <span className={cn("shrink-0 tabular-nums", level === "over" ? "font-semibold text-destructive-text" : level === "warn" ? "font-semibold text-warning-text" : "text-fg-muted")}>{text}</span>
        </span>
      ) : null}
      <MeterTrack className={cn("rounded-full bg-muted", size === "sm" ? "h-1.5" : "h-2")}>
        <MeterIndicator className={cn("rounded-full motion-reduce:transition-none", level === "over" ? "bg-destructive" : level === "warn" ? "bg-warning" : "bg-trade")} />
      </MeterTrack>
      {caption ? <span className="text-caption text-fg-muted">{caption}</span> : null}
    </MeterRoot>
  );
}

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* Funnel                                                                                                                                */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

export interface FunnelStep {
  key: string;
  label: string;
  value: number;
}

const rateText = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "–");

/**
 * The funnel as stacked bars on one scale (the widest step): each step's bar in the accent, the people lost since the step before as a
 * hatched ghost behind it, and a "62.5% continued" chip between steps (red when fewer than `lowAt` continue). Signups can outnumber visits
 * (a rep signs a shop that never saw a landing page), so a bar never goes past the full width. An ordered list with each step's text, so
 * a screen reader hears "Completed signup, 42, 12.5% of the step before".
 */
export function FunnelChart({ steps, label = "Conversion funnel", lowAt = 0.2 }: { steps: FunnelStep[]; label?: string; lowAt?: number }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  const w = (v: number) => (v ? Math.max(1.5, Math.min(100, (v / max) * 100)) : 0);
  return (
    <ol aria-label={label} className="flex flex-col">
      {steps.map((s, i) => {
        const prev = i ? steps[i - 1]!.value : null;
        const carried = prev !== null && prev > 0 ? s.value / prev : null;
        return (
          <li key={s.key} className="flex flex-col">
            {prev !== null ? (
              <span className="flex items-center gap-2 py-1.5 ps-3 text-caption text-fg-muted" aria-hidden={carried === null || undefined}>
                <span aria-hidden className="h-4 w-px bg-line" />
                {carried !== null ? (
                  <span className={cn("rounded-r4 px-1.5 py-0.5 font-semibold tabular-nums", carried < lowAt ? "bg-destructive-soft text-destructive-text" : "bg-muted text-foreground")}>{rateText(s.value, prev)}</span>
                ) : null}
                <span className="sr-only"> of the step before</span>
                <span aria-hidden>{carried !== null ? "continued" : ""}</span>
              </span>
            ) : null}
            <div className="rounded-r4 border border-line bg-card px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span aria-hidden className="text-caption font-semibold tabular-nums text-fg-muted">{i + 1}</span>
                  <span className="min-w-0 truncate text-meta font-medium text-fg">{s.label}</span>
                </span>
                <span className="shrink-0 text-body font-semibold tabular-nums text-fg">{formatNumber(s.value)}</span>
              </div>
              <div className="relative mt-2 h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                {prev !== null && prev > s.value ? <span className="absolute inset-y-0 start-0 rounded-full bg-trade/20" style={{ width: `${w(prev)}%` }} /> : null}
                <span className="absolute inset-y-0 start-0 rounded-full bg-trade transition-[width] duration-700 ease-out motion-reduce:transition-none" style={{ width: `${w(s.value)}%` }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* Empty and loading inside a panel                                                                                                      */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

/** The empty state inside a panel or table: a 40 px icon chip, one line, an optional muted line and one action. Never a dead end. */
export function PanelEmpty({ icon: Icon = Inbox, title, description, action, className, tone = "neutral" }: { icon?: LucideIcon; title: string; description?: ReactNode; action?: ReactNode; className?: string; tone?: "neutral" | "good" }) {
  return (
    <div data-state="empty" className={cn("flex flex-col items-center gap-2 px-4 py-8 text-center", className)}>
      <span aria-hidden className={cn("mb-1 inline-flex size-10 items-center justify-center rounded-r4", tone === "good" ? "bg-success-soft text-success-text" : "bg-muted text-muted-foreground")}>
        <Icon className="size-5" strokeWidth={1.75} />
      </span>
      <p className="text-body font-[550] text-fg">{title}</p>
      {description ? <p className="max-w-sm text-meta text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/** Skeleton rows for a list inside a panel (the height of a 48 px Row). */
export function RowSkeletons({ rows = 4, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-busy="true" aria-label={label} className="flex flex-col divide-y divide-line">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex h-12 items-center gap-3">
          <Skeleton className="size-2 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
          <Skeleton className="h-3 w-12 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------------------------ */
/* Flow steps (rep phone flow)                                                                                                           */
/* ------------------------------------------------------------------------------------------------------------------------------------ */

/**
 * A short flow's steps on the ReUI Stepper: numbered circles joined by a line, a tick on finished steps, the name under each (all widths:
 * keep names to one or two words). `step` is 1-based; `null` means all done. Not interactive (the flow owns Back); exposed as one
 * progressbar with `label` ("Step 1 of 2: The shop"). RTL: the line runs from the inline start.
 */
export function FlowSteps({ step, labels, label, className }: { step: number | null; labels: string[]; label: string; className?: string }) {
  const total = labels.length;
  const current = step ?? total + 1;
  return (
    <Stepper
      value={current}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(total, current - 1)}
      aria-valuetext={label}
      aria-label={label}
      aria-orientation={undefined}
      className={className}
      data-flow-steps
    >
      <div data-slot="stepper-nav" data-orientation="horizontal" className="group/stepper-nav flex w-full flex-row items-start">
        {labels.map((l, i) => {
          const n = i + 1;
          return (
            <StepperItem key={l} step={n} aria-hidden className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5 not-last:flex-1 group-data-[orientation=horizontal]/stepper-nav:flex-col">
              <StepperIndicator className="z-[1] size-8 border-2 border-card bg-muted text-caption font-semibold text-muted-foreground data-[state=active]:bg-trade data-[state=active]:text-trade-foreground data-[state=completed]:bg-trade data-[state=completed]:text-trade-foreground">
                {n < current ? <Check className="size-4" strokeWidth={3} /> : n}
              </StepperIndicator>
              <StepperTitle className="max-w-full truncate px-1 text-center text-caption font-[550] leading-4 text-muted-foreground data-[state=active]:text-foreground data-[state=completed]:text-foreground">{l}</StepperTitle>
              {n < total ? <StepperSeparator className="absolute start-[calc(50%+18px)] end-[calc(-50%+18px)] top-4 m-0 h-0.5 -translate-y-1/2 rounded-full bg-muted data-[state=completed]:bg-trade" /> : null}
            </StepperItem>
          );
        })}
      </div>
    </Stepper>
  );
}
