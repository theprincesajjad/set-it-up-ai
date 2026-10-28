import { Check } from "lucide-react";
import { ADD_ONS, ADD_ON_IDS, FEATURES, FEES, FOUNDING_OFFER, RESTAURANT_FEATURES, RESTAURANT_PLANS, RESTAURANT_TIERS, type RestaurantTier } from "@ll/shared";
import { FoundingLine } from "@/components/marketing/FoundingStrip";
import { SavingsCalculator } from "@/components/marketing/SavingsCalculator";
import { MSection } from "@/components/marketing/Section";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { fill, moneyShort } from "@/lib/marketing/text";

const P = copy.pricing;
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** Features a tier adds over the one below it (from the shared list, so the page can't drift from gating). */
const added = (tier: RestaurantTier) => RESTAURANT_FEATURES.filter((k) => FEATURES[k].packTier === tier).map((k) => FEATURES[k].name);
const below: Record<RestaurantTier, string> = { starter: "Everything in Café & Retail, plus", growth: "Everything in Starter, plus", pro: "Everything in Growth, plus" };
const shortName = (tier: RestaurantTier) => RESTAURANT_PLANS[tier].name.replace(/^Restaurant /, "");

function TierCard({ tier, featured }: { tier: RestaurantTier; featured?: boolean }) {
  const p = RESTAURANT_PLANS[tier];
  return (
    <div className={cn("flex flex-col rounded-sheet bg-background p-6 md:p-8", featured ? "border-[1.5px] border-foreground" : "border border-border")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-headline text-foreground">{shortName(tier)}</h3>
        {featured ? <Badge tone="accent">Tiffin and catering</Badge> : null}
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="display text-mkt-lg tabular-nums">{moneyShort(p.priceCents)}</span>
        <span className="text-body text-muted-foreground">/month</span>
      </p>
      <p className="text-meta text-muted-foreground">
        or {moneyShort(p.annualPriceCents)} a year · {p.whatsappPerMonth.toLocaleString("en-CA")} WhatsApp messages
      </p>
      <p className="mt-3 text-body text-foreground">{P.restaurantLines[tier]}</p>
      <Button href={`/signup?plan=restaurant-${tier}`} variant={featured ? "primary" : "secondary"} fullWidth size="lg" className="mt-6">
        {`Start ${shortName(tier)}`}
      </Button>
      <div className="mt-8">
        <h4 className="text-meta-strong text-muted-foreground">{below[tier]}</h4>
        <ul className="mt-1">
          {added(tier).map((f) => (
            <li key={f} className="flex gap-2.5 py-1.5 text-meta">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-foreground" strokeWidth={2} />
              <span className="text-foreground">{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Restaurant pack: tiers and the founding offer, the per-order math against the delivery apps, and add-ons. */
export function RestaurantPricing() {
  const growth = RESTAURANT_PLANS.growth;
  const fees: [string, string][] = [
    [P.fees.online, FEES.orderBpsPaid === 0 ? "0%" : pct(FEES.orderBpsPaid)],
    [P.fees.serviceFee, fill(P.fees.serviceFeeNote, { amount: formatMoney(FEES.customerServiceFeeCents) })],
    [P.fees.deposits, pct(FEES.depositInvoiceBps)],
    [P.fees.tiffin, pct(FEES.tiffinBps)],
  ];
  return (
    <>
      <MSection id="restaurants" tone="subtle" className="scroll-mt-20 md:py-24!">
        <p className="text-meta-strong text-muted-foreground">For restaurants</p>
        <h2 className="display mt-4 max-w-3xl text-mkt-md text-balance md:text-mkt-lg">{P.restaurantTitle}</h2>
        <p className="mt-5 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">{P.restaurantSub}</p>
        <div className="mt-10 grid items-stretch gap-4 lg:grid-cols-3">
          {RESTAURANT_TIERS.map((t) => (
            <TierCard key={t} tier={t} featured={t === "growth"} />
          ))}
        </div>

        <div className="mt-8 rounded-sheet border border-border bg-background p-6 md:p-8">
          <Badge tone="accent">Founding restaurants</Badge>
          <h3 className="display mt-4 text-mkt-sm text-balance">
            {FOUNDING_OFFER.firstYearPct}% off for a year, then {FOUNDING_OFFER.lifetimePct}% off for life.
          </h3>
          <p className="mt-3 max-w-3xl text-body text-muted-foreground">
            The first {FOUNDING_OFFER.slotsPerCorridor} restaurants on each corridor. Growth is {formatMoney(Math.round((growth.priceCents * (100 - FOUNDING_OFFER.firstYearPct)) / 100))} a month in year one, then{" "}
            {formatMoney(Math.round((growth.priceCents * (100 - FOUNDING_OFFER.lifetimePct)) / 100))}. <FoundingLine />
          </p>
        </div>
      </MSection>

      <MSection id="math" className="md:py-24!">
        <p className="text-meta-strong text-muted-foreground">{P.math.eyebrow}</p>
        <h2 className="display mt-3 text-mkt-md text-balance md:text-mkt-lg">{P.math.title}</h2>
        <p className="mt-4 max-w-2xl text-body text-muted-foreground">{P.math.sub}</p>
        <div className="mt-8">
          <SavingsCalculator planName={growth.name} planPriceCents={growth.priceCents} />
        </div>
        <dl className="mt-10 divide-y divide-border overflow-hidden rounded-sheet border border-border bg-background">
          {fees.map(([k, v]) => (
            <div key={k} className="grid gap-1 px-5 py-4 text-meta sm:grid-cols-2 md:px-6">
              <dt className="text-muted-foreground">{k}</dt>
              <dd className="text-body-strong text-foreground">{v}</dd>
            </div>
          ))}
        </dl>
      </MSection>

      <MSection tone="subtle">
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <div>
            <h2 className="display text-mkt-md md:text-mkt-lg">{P.addOnsTitle}</h2>
            <p className="mt-4 text-body text-muted-foreground">{P.addOnsSub}</p>
          </div>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {ADD_ON_IDS.map((id) => (
              <li key={id} className="flex items-baseline justify-between gap-6 py-4">
                <p className="text-body text-foreground">{ADD_ONS[id].name}</p>
                <p className="shrink-0 text-body-strong tabular-nums text-foreground">
                  {moneyShort(ADD_ONS[id].priceCents)}
                  <span className="text-meta font-normal text-muted-foreground">{ADD_ONS[id].unit === "pack" ? " per pack" : " a month"}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </MSection>
    </>
  );
}
