"use client";
/**
 * "This week" on Today (docs/business/pro-value.md 3.2 P6 and 5.1): what the week has booked, how it compares with last week, the goal as
 * a bar that fills, and what the waitlist, reminders and reviews brought back. The moment the founder cares about is "better than last
 * week", so that is the loudest thing on the card: a green chip with the dollars ahead, and a quiet "best week in 8" when it is one.
 * Behind is said plainly in neutral grey, never red. On Free the card shows the numbers and the delta, then the locked lines with the
 * shop's own counts (each only when above zero) and one PlanLine. Nothing is typed: prices and counts come from the API and PLANS.
 */
import { Target } from "lucide-react";
import Link from "next/link";
import { APPOINTMENT_VERTICALS, PLANS } from "@ll/shared";
import { Panel, QuietLink, SkeletonRows } from "@/components/dashboard/kit";
import { PlanLine } from "@/components/onboarding/PlanLine";
import { useApi } from "@/lib/dashboard/useApi";
import { billingHref, hasActivity, lockedLines, signalLine, weekdayLabel } from "@/lib/dashboard/insights";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useMerchant } from "../MerchantContext";
import { DeltaChips, GoalBar, TrendBars } from "./WeekParts";

export function ThisWeekTile() {
  const { api, base, role, enabled, detail } = useMerchant();
  const loc = useLocaleOrEnglish();
  const { t } = loc;
  const manager = role !== "staff";
  const state = useApi(manager ? () => api.insights.week() : null, [api, manager], { pollMs: 300_000 });
  const w = state.data;
  if (!manager || state.error) return null;
  if (!w) return state.loading ? <Panel title={t("insights.tile.title")} className="min-h-44"><SkeletonRows rows={2} /></Panel> : null;
  // A shop that does not book by appointment and has nothing this week or last has no money story to tell.
  const active = hasActivity(w);
  if (!active && !enabled("booking.appointments")) return null;

  const day = (weekday: number) => weekdayLabel(loc.date, weekday);
  const plan = PLANS.plus.name;
  const parts = w.paid ? signalLine(w.signals) : [];
  const locked = w.paid ? [] : lockedLines(w);
  const lockedText = (l: (typeof locked)[number]) =>
    l.kind === "cancellations" ? t("insights.locked.cancellations", { n: l.n, plan }) : t("insights.locked.fullDay", { n: l.n, day: day(l.weekday), plan });
  // Each line only when its count is above zero; the "in your inbox" line goes with them. The last line carries the one PlanLine.
  const lines = locked.length ? [...locked.map(lockedText), t("insights.locked.inbox", { weekday: day(w.report.weekday), plan })] : [];
  const see = t("insights.locked.see", { plan });

  return (
    <Panel title={t("insights.tile.title")} className="this-week" action={<QuietLink href={`${base}/reports/week`} className="min-h-11">{t("insights.tile.full")}</QuietLink>}>
      <div data-testid="this-week" className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-2">
            <p className="flex flex-wrap items-baseline gap-x-2 text-fg">
              <span data-testid="week-revenue" className="text-display-number tabular-nums">{loc.money(w.revenueCents)}</span>
              {/* A shop without appointments takes money at the till: "in sales", not "booked". */}
              <span className="text-body text-fg-muted">{t(APPOINTMENT_VERTICALS.includes(detail.merchant.vertical) ? "insights.tile.booked" : "insights.tile.sales")}</span>
            </p>
            {active ? <DeltaChips w={w} /> : <p className="text-body text-fg-muted">{t("insights.tile.empty")}</p>}
          </div>
          {active ? <TrendBars trend={w.trend} className="w-40 shrink-0 max-sm:w-full" /> : null}
        </div>

        {w.goal.cents ? (
          <GoalBar goal={w.goal} />
        ) : (
          <Link href={`${base}/settings/goal`} className="relative inline-flex items-center gap-1.5 self-start text-meta font-medium text-link hover:underline focus-visible:focus-ring after:absolute after:-inset-y-3 after:inset-x-0 after:content-['']">
            <Target aria-hidden className="size-3.5" />
            {t("insights.tile.goalSet")}
          </Link>
        )}

        {parts.length ? (
          <p data-testid="week-signals" className="text-body text-fg-muted">
            {parts.map((p) => t(`insights.short.${p.key}`, { n: p.n })).join(" · ")}
          </p>
        ) : null}

        {lines.length ? (
          <div data-testid="week-locked" className="flex flex-col gap-1.5 border-t border-line pt-3">
            {lines.slice(0, -1).map((l) => (
              <p key={l} className="text-body text-fg-muted">
                {l}
              </p>
            ))}
            <PlanLine linkLabel={see} href={billingHref(base)}>
              {lines[lines.length - 1]}
            </PlanLine>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
