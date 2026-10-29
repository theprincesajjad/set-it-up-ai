"use client";
/**
 * phase-pro P1 · The trial on the billing page (docs/business/pro-value.md §3.2 P1, §5.3–5.4):
 *  - live: "Pro ends {weekday} · {n} days left" with Keep Pro monthly and yearly (the first-year price struck through);
 *  - ended without a paid plan: "Pro ended {weekday}." with the receipt numbers;
 *  - never had one (Free, no restaurant tier): "Try Pro free for 14 days" with a button that starts it.
 * Words from the shared catalogue (trial.*), numbers from the API, prices from PLANS.
 */
import { Sparkles } from "lucide-react";
import { PLANS, TRIAL_DAYS, type billingApi } from "@ll/shared";
import { Panel } from "@/components/dashboard/kit";
import { useMerchant } from "@/components/dashboard/MerchantContext";
import { receiptHasNumbers, trialMoment } from "@/components/dashboard/home/TrialCard";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { useAction, useApi } from "@/lib/dashboard/useApi";
import { useLocaleOrEnglish } from "@/lib/i18n/client";

export function TrialBanner({
  b,
  busy,
  onKeep,
  reload,
}: {
  b: billingApi.BillingOverviewResponse;
  busy: boolean;
  onKeep: (interval: "month" | "year") => void;
  reload: () => Promise<void>;
}) {
  const { api } = useMerchant();
  const loc = useLocaleOrEnglish();
  const { t } = loc;
  const act = useAction();
  const moment = trialMoment(b.usage);
  const ended = moment?.kind === "ended";
  const receipt = useApi(ended ? () => api.insights.trial() : null, [api, ended]);
  const plan = PLANS.plus.name;
  const short = (cents: number) => loc.money(cents).replace(/\.00$/, "");
  const fy = b.firstYearPrice?.eligible && b.firstYearPrice.priceCents < b.firstYearPrice.listPriceCents ? b.firstYearPrice : null;

  const keepButtons = (
    <div className="flex flex-wrap items-center gap-2">
      <Button loading={busy} onClick={() => onKeep("month")} data-testid="keep-monthly">
        {t("trial.card.keep", { plan })} · {t("trial.banner.perMonth", { price: short(PLANS.plus.priceCents) })}
      </Button>
      <Button variant="secondary" loading={busy} onClick={() => onKeep("year")} data-testid="keep-yearly">
        <span>{t("trial.banner.keepYearly", { plan })} ·</span>
        {fy ? (
          <span className="inline-flex items-baseline gap-1">
            <span className="sr-only">{copy.proBilling.firstYear}: </span>
            <s className="tabular-nums opacity-70">{short(fy.listPriceCents)}</s>
            <span className="tabular-nums">{short(fy.priceCents)}</span>
            <span>{t("trial.banner.firstYear")}</span>
          </span>
        ) : (
          <span>{t("trial.banner.perYear", { price: short(PLANS.plus.annualPriceCents) })}</span>
        )}
      </Button>
    </div>
  );

  if (moment?.kind === "start" || moment?.kind === "ending") {
    const weekday = loc.date(moment.trial.endsAt, { weekday: "long" });
    return (
      <Panel>
        <div data-testid="trial-banner" data-moment="live" className="flex flex-col gap-3">
          <p className="flex items-start gap-2 text-body-strong text-fg">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-trade" />
            {t("trial.banner.live", { plan, weekday, n: moment.trial.daysLeft })}
          </p>
          <p className="text-body text-fg-muted">{t("trial.banner.liveBody")}</p>
          {keepButtons}
        </div>
      </Panel>
    );
  }

  if (ended) {
    const r = receipt.data;
    return (
      <Panel>
        <div data-testid="trial-banner" data-moment="ended" className="flex flex-col gap-3">
          <p className="text-body-strong text-fg">{t("trial.banner.ended", { plan, weekday: loc.date(moment.endedAt, { weekday: "long" }) })}</p>
          {r ? (
            <p className="text-body tabular-nums text-fg">
              {t("trial.receipt.summary", { days: r.days, bookings: r.bookings, amount: loc.money(r.amountCents) })}
              {receiptHasNumbers(r) ? <span className="block text-meta text-fg-muted">{t("trial.receipt.parts", { fills: r.fills, rebooked: r.rebooked, reviews: r.reviews, addons: r.addons })}</span> : null}
            </p>
          ) : null}
          <p className="text-meta text-fg-muted">{t("trial.receipt.paused", { plan })}</p>
          {keepButtons}
        </div>
      </Panel>
    );
  }

  // Never had a trial: offer it (Free shops only; the booking link going live starts it too).
  if (b.plan === "free" && !b.restaurantTier && !b.subscription && b.usage && !b.usage.trialUsed) {
    return (
      <Panel>
        <div data-testid="trial-banner" data-moment="offer" className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-body text-fg">
            <Sparkles aria-hidden className="mt-0.5 size-4 shrink-0 text-trade" />
            {t("trial.banner.offer", { plan, days: TRIAL_DAYS })}
          </p>
          <Button
            loading={act.busy}
            onClick={async () => {
              if (await act.run(() => api.billing.startTrial())) await reload();
            }}
          >
            {t("trial.banner.start")}
          </Button>
        </div>
        {act.error ? <p role="alert" className="mt-2 text-meta text-negative">{act.error}</p> : null}
      </Panel>
    );
  }
  return null;
}
