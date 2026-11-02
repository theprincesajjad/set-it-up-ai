"use client";
/**
 * Pieces shared by the founder's cockpit pages (wave N, team admin): the period switch, delta lines, status and flag labels,
 * the conversion funnel bars and a small usage sparkline. Admin pages are English only, like the rest of /admin.
 * Charts follow the dataviz rules: one series in the trade colour, a recessive grid, a table view, numbers in text ink.
 */
import type { adminCockpitApi } from "@ll/shared";
import type { StatItem } from "@/components/dashboard/kit";
import { Segmented, StatusPill } from "@/components/dashboard/kit";
import { formatNumber } from "@/lib/format";

export type Period = adminCockpitApi.CockpitPeriod;
export const PERIOD_OPTIONS: { value: `${Period}`; label: string }[] = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
];

export function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return <Segmented label="Period" options={PERIOD_OPTIONS} value={`${value}` as `${Period}`} onChange={(v) => onChange(Number(v) as Period)} />;
}

/** "+12% vs previous 30 days"; null when there is nothing to compare with. */
export function deltaLine(d: adminCockpitApi.Delta, context: string, upIsGood = true): StatItem["delta"] {
  if (d.deltaPct === null) return d.previous === 0 && d.current > 0 ? { text: "New", good: null, context } : null;
  const up = d.deltaPct > 0;
  return { text: `${up ? "+" : ""}${d.deltaPct}%`, good: d.deltaPct === 0 ? null : up === upIsGood, context };
}

export const STATUS_LABEL: Record<adminCockpitApi.BusinessStatus, string> = { trial: "Trial", paying: "Paying", churned: "Churned", free: "Free" };
const STATUS_TONE = { trial: "info", paying: "positive", churned: "neutral", free: "neutral" } as const;
export function BusinessStatus({ status }: { status: adminCockpitApi.BusinessStatus }) {
  return <StatusPill tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</StatusPill>;
}

export const FLAG_LABEL: Record<adminCockpitApi.HealthFlag, string> = {
  payment_failed: "Payment failed",
  trial_ending_not_activated: "Trial ending, not activated",
  usage_drop: "Usage dropped over 40%",
  no_activity_14d: "No activity 14 days",
};
/** Short pill text for dense tables; the full label is the pill's title. */
const FLAG_SHORT: Record<adminCockpitApi.HealthFlag, string> = { payment_failed: "Payment failed", trial_ending_not_activated: "Trial ending", usage_drop: "Usage down", no_activity_14d: "Inactive 14 d" };
export function FlagPills({ flags }: { flags: adminCockpitApi.HealthFlag[] }) {
  if (!flags.length) return <span className="text-meta text-fg-muted">–</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} title={FLAG_LABEL[f]}>
          <StatusPill tone={f === "payment_failed" ? "negative" : "accent"}>{FLAG_SHORT[f]}</StatusPill>
        </span>
      ))}
    </span>
  );
}

export const PLAN_LABEL: Record<string, string> = { free: "Free", plus: "Pro", studio: "Studio", pro: "Service", restaurant: "Restaurant" };
export const planLabel = (p: string) => PLAN_LABEL[p] ?? p;

export const FUNNEL_STEPS: { key: keyof adminCockpitApi.FunnelCounts; label: string }[] = [
  { key: "views", label: "Viewed a landing page" },
  { key: "ctaClicks", label: "Clicked a call to action" },
  { key: "signupStarted", label: "Started signup" },
  { key: "signupCompleted", label: "Completed signup" },
  { key: "wentLive", label: "Went live" },
  { key: "paid", label: "Paid" },
];

const pctOf = (n: number, of: number) => (of ? `${Math.round((n / of) * 1000) / 10}%` : "–");

/**
 * The funnel as horizontal bars on one scale (the first step), each with its count and its rate from the step before. Signups can
 * outnumber visits (shops signed by a rep never saw a landing page), so a bar is capped at the full width.
 */
export function FunnelBars({ counts }: { counts: adminCockpitApi.FunnelCounts }) {
  const max = Math.max(1, ...FUNNEL_STEPS.map((s) => counts[s.key]));
  return (
    <ol className="flex flex-col gap-3" aria-label="Conversion funnel">
      {FUNNEL_STEPS.map((s, i) => {
        const v = counts[s.key];
        const prev = i ? counts[FUNNEL_STEPS[i - 1]!.key] : 0;
        return (
          <li key={s.key}>
            <div className="flex items-baseline justify-between gap-3 text-meta">
              <span className="min-w-0 truncate text-fg">{s.label}</span>
              <span className="shrink-0 tabular text-fg">
                {formatNumber(v)}
                {i ? <span className="text-fg-muted"> · {pctOf(v, prev)} of the step before</span> : null}
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-trade-soft" aria-hidden>
              <div className="h-full rounded-full bg-trade" style={{ width: `${v ? Math.max(1.5, Math.min(100, (v / max) * 100)) : 0}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A tiny usage line (weeks, oldest first) in text ink; the label says what it shows for screen readers. */
export function Sparkline({ values, label, width = 96, height = 24 }: { values: number[]; label: string; width?: number; height?: number }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : width;
  const pts = values.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / max) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg role="img" aria-label={label} width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 text-fg-muted">
      <line x1="0" x2={width} y1={height - 1} y2={height - 1} stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" />
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 1000) / 10}%`);
