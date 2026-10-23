"use client";
import { useId, useState } from "react";
import { copy } from "@/copy/en-CA";
import { DOORDASH_CANADA, formatAsOf } from "@/lib/marketing/sources";
import { SAVINGS_RANGE, appCommission, dollarRange, dollars } from "@/lib/marketing/savings";

/**
 * "What you keep on your own orders": a slider of monthly orders and the three rows that follow from it. The
 * commission figures are DoorDash Canada's published rates (lib/marketing/sources.ts); pickup is a range and
 * delivery is "up to". The flat plan price comes from RESTAURANT_PLANS through `planName` and `planPriceCents`.
 */
export function SavingsCalculator({ planName, planPriceCents }: { planName: string; planPriceCents: number }) {
  const id = useId();
  const [cents, setCents] = useState<number>(SAVINGS_RANGE.defaultCents);
  const c = appCommission(cents);
  const m = copy.pricing.math;
  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="rounded-sheet bg-bg-subtle p-6 md:p-8">
          <label htmlFor={id} className="text-meta-strong text-fg-muted">
            {m.sliderLabel}
          </label>
          <output htmlFor={id} aria-live="polite" className="display mt-3 block text-mkt-md tabular-nums md:text-mkt-lg">
            {dollars(cents)}
          </output>
          <input
            id={id}
            type="range"
            min={SAVINGS_RANGE.minCents}
            max={SAVINGS_RANGE.maxCents}
            step={SAVINGS_RANGE.stepCents}
            value={cents}
            onChange={(e) => setCents(Number(e.target.value))}
            aria-valuetext={`${dollars(cents)} a month`}
            className="mt-5 block h-6 w-full cursor-pointer accent-[var(--ll-color-fg)]"
          />
          <p className="mt-2 text-meta text-fg-muted">{m.sliderHint}</p>
        </div>
        <dl className="overflow-hidden rounded-sheet border border-line bg-bg">
          <div className="border-b border-line px-5 py-4 md:px-6">
            <dt className="text-meta text-fg-muted">{m.pickup}</dt>
            <dd data-testid="calc-pickup" className="display mt-1 text-mkt-sm tabular-nums">
              {dollarRange(c.pickupLowCents, c.pickupHighCents)}
            </dd>
          </div>
          <div className="border-b border-line px-5 py-4 md:px-6">
            <dt className="text-meta text-fg-muted">{m.delivery}</dt>
            <dd data-testid="calc-delivery" className="display mt-1 text-mkt-sm tabular-nums">
              up to {dollars(c.deliveryMaxCents)}
            </dd>
          </div>
          <div className="bg-accent-soft px-5 py-4 md:px-6">
            <dt className="text-meta text-fg-muted">{m.flat}</dt>
            <dd data-testid="calc-flat" className="display mt-1 text-mkt-sm tabular-nums text-accent-text">
              {dollars(planPriceCents)}
              <span className="sr-only"> a month for {planName}</span>
            </dd>
          </div>
        </dl>
      </div>
      <p className="mt-6 max-w-4xl text-caption text-fg-muted">
        {m.sources}{" "}
        <a href={DOORDASH_CANADA.sourceUrl} className="underline decoration-line-strong/60 underline-offset-2 hover:decoration-fg">
          merchants.doordash.com/en-ca
        </a>
        , read {formatAsOf(DOORDASH_CANADA.asOf)}.
      </p>
    </div>
  );
}
