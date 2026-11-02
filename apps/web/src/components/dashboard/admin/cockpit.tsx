"use client";
/**
 * Pieces shared by the founder's cockpit pages (wave N, team admin): the period switch, delta lines, status and flag labels,
 * the conversion funnel bars and a small usage sparkline. Admin pages are English only, like the rest of /admin.
 * Charts follow the dataviz rules: one series in the trade colour, a recessive grid, a table view, numbers in text ink.
 */
import type { adminCockpitApi } from "@ll/shared";
import type { StatItem } from "@/components/dashboard/kit";
import { Segmented } from "@/components/dashboard/kit";
import { FunnelChart, HealthPill } from "@/components/dashboard/admin/AdminKit";
import { Sparkline as AreaSpark } from "@/components/ui/Sparkline";

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
const STATUS_TONE = { trial: "info", paying: "ok", churned: "neutral", free: "neutral" } as const;
/** Trial / Paying / Churned / Free as a status pill with a dot (wave Q: kit HealthPill). */
export function BusinessStatus({ status }: { status: adminCockpitApi.BusinessStatus }) {
  return (
    <HealthPill size="sm" tone={STATUS_TONE[status]}>
      {STATUS_LABEL[status]}
    </HealthPill>
  );
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
          <HealthPill size="sm" tone={f === "payment_failed" ? "down" : "warn"}>
            {FLAG_SHORT[f]}
          </HealthPill>
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

/**
 * The funnel (wave Q: the kit FunnelChart): bars on one scale with the drop-off since the step before as a ghost and the share that
 * continued between steps. Signups can outnumber visits (shops signed by a rep never saw a landing page), so a bar is capped at full width.
 */
export function FunnelBars({ counts }: { counts: adminCockpitApi.FunnelCounts }) {
  return <FunnelChart label="Conversion funnel" steps={FUNNEL_STEPS.map((s) => ({ key: s.key, label: s.label, value: counts[s.key] }))} />;
}

/** A tiny usage area line (weeks, oldest first) in the accent; the label says what it shows for screen readers. */
export function Sparkline({ values, label, width = 96, height = 28 }: { values: number[]; label: string; width?: number; height?: number }) {
  return (
    <span role="img" aria-label={label} className="inline-flex shrink-0 items-center text-trade" style={{ width, height }}>
      {values.some((v) => v > 0) ? <AreaSpark values={values} className="h-full w-full" strokeWidth={1.75} /> : <span className="h-px w-full bg-line" />}
    </span>
  );
}

export const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 1000) / 10}%`);
