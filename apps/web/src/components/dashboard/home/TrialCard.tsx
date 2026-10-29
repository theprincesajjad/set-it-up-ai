"use client";
/**
 * phase-pro P1 · The trial on Today (docs/business/pro-value.md §5.2–5.4). P6 mounts it on Today by import.
 *  - the trial is live with more than three days left: the start card ("Your link is live. Pro is on for 14 days, free.");
 *  - three days or fewer: "Pro ends {weekday}." with what it did so far (P6's 14-day receipt), and Keep Pro / Let it end;
 *  - it ended in the last week without a paid plan: the receipt, with "Turn Pro on".
 * Nothing renders on a paid plan, for staff, or when the shop never had a trial. Every number comes from the API; prices from PLANS.
 */
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { PLANS, TRIAL_DAYS, TRIAL_REMINDER_DAYS_LEFT, type billingApi, type reportsApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { Button } from "@/components/ui/Button";
import { useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";
import { useMerchant } from "../MerchantContext";

/** How long after the trial ends the receipt stays on Today. */
const RECEIPT_DAYS = 7;
const DISMISS_KEY = "ll.trial.letEnd";

export type TrialMoment = { kind: "start"; trial: billingApi.TrialDto } | { kind: "ending"; trial: billingApi.TrialDto } | { kind: "ended"; endedAt: string } | null;

/** Which trial moment a shop is in (pure, so the billing page and Today agree). */
export function trialMoment(usage: Pick<billingApi.PlanUsageDto, "plan" | "trial" | "trialEndedAt"> | null | undefined, now: Date = new Date()): TrialMoment {
  if (!usage) return null;
  if (usage.trial) return usage.trial.daysLeft > TRIAL_REMINDER_DAYS_LEFT ? { kind: "start", trial: usage.trial } : { kind: "ending", trial: usage.trial };
  if (usage.plan === "free" && usage.trialEndedAt && now.getTime() - new Date(usage.trialEndedAt).getTime() < RECEIPT_DAYS * 86_400_000) return { kind: "ended", endedAt: usage.trialEndedAt };
  return null;
}

/** "3 cancelled slots filled, …" when anything happened; null when every count is zero (then the quiet line is said instead). */
export function receiptHasNumbers(r: reportsApi.TrialReceiptDto | null | undefined): boolean {
  return !!r && r.fills + r.rebooked + r.reviews + r.addons > 0;
}

function readDismissed(endsAt: string): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === endsAt;
  } catch {
    return false;
  }
}

export function TrialCard() {
  const { api, base, role } = useMerchant();
  const loc = useLocaleOrEnglish();
  const { t } = loc;
  const manager = role !== "staff";
  const usage = useApi(manager ? () => api.billing.usage() : null, [api, manager]);
  const moment = trialMoment(usage.data);
  const wantsReceipt = moment?.kind === "ending" || moment?.kind === "ended";
  const receipt = useApi(wantsReceipt ? () => api.insights.trial() : null, [api, wantsReceipt]);
  const [dismissed, setDismissed] = useState<string | null>(null);
  if (!manager || !moment) return null;

  const plan = PLANS.plus.name;
  const price = loc.money(PLANS.plus.priceCents).replace(/\.00$/, "");
  const annual = loc.money(PLANS.plus.annualPriceCents).replace(/\.00$/, "");
  const r = receipt.data;
  const billing = `${base}/billing?plan=plus`;

  if (moment.kind === "start") {
    const date = loc.date(moment.trial.endsAt, { weekday: "long", month: "long", day: "numeric" });
    return (
      <Panel className="trial-card">
        <div data-testid="trial-card" data-moment="start" className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-body-strong text-fg">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-trade" />
            {t("trial.card.startTitle", { plan, days: TRIAL_DAYS })}
          </p>
          <p className="text-body text-fg-muted">{t("trial.card.startBody", { date })}</p>
          <div className="flex flex-wrap gap-2">
            <Button href={`${base}/billing`} variant="secondary">{t("trial.card.seeOn")}</Button>
            <Button href={`${base}/settings/goal`} variant="secondary">{t("trial.card.goal")}</Button>
          </div>
        </div>
      </Panel>
    );
  }

  const parts = r ? { fills: r.fills, rebooked: r.rebooked, reviews: r.reviews, addons: r.addons } : null;
  if (moment.kind === "ending") {
    if (dismissed === moment.trial.endsAt || readDismissed(moment.trial.endsAt)) return null;
    const weekday = loc.date(moment.trial.endsAt, { weekday: "long" });
    return (
      <Panel className="trial-card">
        <div data-testid="trial-card" data-moment="ending" className="flex flex-col gap-3">
          <p className="text-body-strong text-fg">{t("trial.card.endsTitle", { plan, weekday })}</p>
          {receipt.loading && !r ? null : receiptHasNumbers(r) ? (
            <p className="text-body text-fg-muted">
              {t("trial.card.soFar", { ...parts!, amount: loc.money(r!.chasedCents) })} {t("trial.card.price", { plan, price, annual })}
            </p>
          ) : (
            <p className="text-body text-fg-muted">{t("trial.card.quiet", { plan, price })}</p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button href={billing}>{t("trial.card.keep", { plan })}</Button>
            <Button
              variant="ghost"
              onClick={() => {
                try {
                  localStorage.setItem(DISMISS_KEY, moment.trial.endsAt);
                } catch {
                  /* private mode: hide for this visit only */
                }
                setDismissed(moment.trial.endsAt);
              }}
            >
              {t("trial.card.letEnd")}
            </Button>
          </div>
        </div>
      </Panel>
    );
  }

  const weekday = loc.date(moment.endedAt, { weekday: "long" });
  return (
    <Panel className="trial-card">
      <div data-testid="trial-card" data-moment="ended" className="flex flex-col gap-3">
        <p className="text-body-strong text-fg">{t("trial.banner.ended", { plan, weekday })}</p>
        {r ? (
          <>
            <p className="text-body tabular-nums text-fg">{t("trial.receipt.summary", { days: r.days, bookings: r.bookings, amount: loc.money(r.amountCents) })}</p>
            <p className="text-meta text-fg-muted">{t("trial.receipt.parts", parts!)}</p>
          </>
        ) : null}
        <p className="text-meta text-fg-muted">{t("trial.receipt.paused", { plan })}</p>
        <div>
          <Button href={billing}>{t("trial.receipt.cta", { plan, price })}</Button>
        </div>
      </div>
    </Panel>
  );
}
