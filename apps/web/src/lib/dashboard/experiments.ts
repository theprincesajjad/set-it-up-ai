/**
 * Plain helpers for /admin/experiments (the API sends the numbers; these only word and format them). Admin pages are English
 * only, like the rest of the admin console (the nav label is the only translated string).
 */
import type { experimentsApi } from "@ll/shared";

export const pct = (p: number, digits = 1) => `${(p * 100).toFixed(digits)}%`;
export const interval = (r: experimentsApi.Rate) => `${pct(r.lo)}–${pct(r.hi)}`;
export const money = (cents: number | null) => (cents === null ? "–" : `$${(cents / 100).toFixed(2)}`);

export const STATUS_LABEL: Record<experimentsApi.ExperimentStatus, string> = {
  scheduled: "Scheduled",
  running: "Running",
  interim: "Interim look open",
  horizon: "Horizon reached",
  ended: "Ended",
};
export const STATUS_TONE: Record<experimentsApi.ExperimentStatus, "neutral" | "info" | "accent" | "positive"> = {
  scheduled: "neutral",
  running: "info",
  interim: "accent",
  horizon: "positive",
  ended: "neutral",
};
export const PAGE_LABEL: Record<string, string> = { nail: "/for-nail-techs", barber: "/for-barbers", groom: "/for-groomers" };
export const METRIC_LABEL: Record<string, string> = { start_submit: "Start-form submits", link_live: "Booking link live" };

/** The banner above the numbers (value-props §3.8). */
export function lookBanner(r: Pick<experimentsApi.ExperimentReport, "look" | "alpha" | "exposures" | "experiment" | "ended">): { tone: "neutral" | "info" | "success"; title: string; body: string } {
  const of = `${r.exposures.toLocaleString("en-CA")} of ${r.experiment.horizonExposures.toLocaleString("en-CA")} exposures`;
  if (r.ended) return { tone: "neutral", title: "This test has ended", body: r.ended.reason ? `Reason: ${r.ended.reason}` : "It reached its pre-registered end date." };
  if (r.look === "interim") return { tone: "info", title: `Interim look is open (α = ${r.alpha})`, body: `${of}. Stop only if a variant is clearly better or clearly worse at this bar. Record the look when you have read it: the p-values then stay hidden until the horizon.` };
  if (r.look === "final") return { tone: "success", title: `Horizon reached (α = ${r.alpha})`, body: `${of}. A variant wins only if its deciding metric is higher at this bar, no guardrail is red and link live is not lower than the control's.` };
  return { tone: "neutral", title: "Not time to decide yet", body: `${of}. A variant that is ahead now is not a winner: p-values appear only at the planned looks.` };
}

export function liftText(l: experimentsApi.Lift | undefined): string {
  if (!l) return "–";
  const rel = l.relative === null ? "n/a" : `${l.relative >= 0 ? "+" : ""}${Math.round(l.relative * 100)}%`;
  return `${rel} (p = ${l.pValue < 0.001 ? "< 0.001" : l.pValue.toFixed(3)})`;
}

export function verdictText(l: experimentsApi.Lift | undefined): string {
  if (!l) return "";
  return l.verdict === "unlikely_chance" ? `The difference is unlikely to be chance (p = ${l.pValue < 0.001 ? "< 0.001" : l.pValue.toFixed(3)})` : "At this point the difference could be chance";
}

const cell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** The per-variant counts as CSV (counts and rates; lifts only when the report carries them). */
export function reportCsv(r: experimentsApi.ExperimentReport): string {
  const head = ["experiment", "variant", "exposures", "start_submits", "start_submit_rate", "signed_up", "link_live", "link_live_rate", "first_booking_7d", "paid_30d", "unmatched_signups", "lift_start_submit", "p_start_submit", "lift_link_live", "p_link_live", "cost_per_signup_cents", "guardrail_status"];
  const rows = r.arms.map((a) => [
    r.experiment.id,
    a.variant,
    a.exposures,
    a.startSubmits,
    a.rates.startSubmit.p.toFixed(4),
    a.signedUp,
    a.linkLive,
    a.rates.linkLive.p.toFixed(4),
    a.firstBooking7d,
    a.paid30d,
    a.unmatchedSignups,
    a.lift?.startSubmit.relative?.toFixed(4) ?? "",
    a.lift?.startSubmit.pValue.toFixed(4) ?? "",
    a.lift?.linkLive.relative?.toFixed(4) ?? "",
    a.lift?.linkLive.pValue.toFixed(4) ?? "",
    a.guardrails.costPerSignupCents,
    a.guardrails.status,
  ]);
  return [head, ...rows].map((row) => row.map(cell).join(",")).join("\n") + "\n";
}
