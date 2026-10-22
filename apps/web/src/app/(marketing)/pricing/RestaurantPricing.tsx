import { Check } from "lucide-react";
import { ADD_ONS, ADD_ON_IDS, FEATURES, FEES, FOUNDING_OFFER, RESTAURANT_FEATURES, RESTAURANT_PLANS, RESTAURANT_TIERS, type RestaurantTier } from "@ll/shared";
import { MSection } from "@/components/marketing/Section";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

const money = (cents: number) => formatMoney(cents).replace(".00", "");
const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

/** Features a tier adds over the one below it (from the shared list, so the page can't drift from gating). */
const added = (tier: RestaurantTier) => RESTAURANT_FEATURES.filter((k) => FEATURES[k].packTier === tier).map((k) => FEATURES[k].name);
const below: Record<RestaurantTier, string> = { starter: "Everything in Café & Retail, plus", growth: "Everything in Restaurant Starter, plus", pro: "Everything in Restaurant Growth, plus" };

const ADD_ON_NOTE: Record<(typeof ADD_ON_IDS)[number], string> = {
  whatsapp_1000: "Another 1,000 WhatsApp messages for Eid, Ramadan or a Diwali rush. Per pack, each billing period.",
  extra_location: "Each additional restaurant, on the same menu, customers and reports.",
  banquet_module: "Hall calendar, packages and deposits for walimas, mehndis and parties, on a Growth plan.",
  phone_ai: "Answers the phone in Urdu, Hindi, Punjabi and English and takes the order.",
};

function TierCard({ tier, featured }: { tier: RestaurantTier; featured?: boolean }) {
  const p = RESTAURANT_PLANS[tier];
  return (
    <div className={cn("flex flex-col rounded-sheet bg-bg p-6 md:p-8", featured ? "border-[1.5px] border-fg" : "border border-line")}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-headline text-fg">{p.name}</h3>
        {featured ? <Badge tone="brand">Tiffin and catering</Badge> : null}
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="display text-mkt-lg tabular-nums">{money(p.priceCents)}</span>
        <span className="text-body text-fg-muted">/month</span>
      </p>
      <p className="text-meta text-fg-muted">or {money(p.annualPriceCents)} a year, two months free</p>
      <p className="mt-3 text-body text-fg">{p.blurb}</p>
      <Button href="/signup" variant={featured ? "primary" : "secondary"} fullWidth size="lg" className="mt-6">
        {`Start ${p.name}`}
      </Button>
      <div className="mt-8">
        <h4 className="text-meta-strong text-fg-muted">{below[tier]}</h4>
        <ul className="mt-1">
          {added(tier).map((f) => (
            <li key={f} className="flex gap-2.5 py-1.5 text-meta">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" strokeWidth={2} />
              <span className="text-fg">{f}</span>
            </li>
          ))}
          {p.whatsappPerMonth ? (
            <li className="flex gap-2.5 py-1.5 text-meta">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" strokeWidth={2} />
              <span className="text-fg">{p.whatsappPerMonth.toLocaleString("en-CA")} WhatsApp messages a month included</span>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

/** Restaurant pack: tiers, add-ons, fees against the delivery apps, founding offer. */
export function RestaurantPricing() {
  return (
    <>
      <MSection id="restaurants" tone="subtle" className="md:py-24!">
        <p className="text-meta-strong text-fg-muted">For restaurants</p>
        <h2 className="display mt-4 max-w-3xl text-mkt-md text-balance md:text-mkt-lg">keep the whole order. from biryani pots to tiffin.</h2>
        <p className="mt-5 max-w-2xl text-[18px] leading-[1.55] text-fg-muted">
          Online ordering with no commission, tiffin subscriptions, catering and pot pre-orders for Eid and Diwali, WhatsApp ordering and a kitchen screen in your cooks&apos; language. Every restaurant plan includes Café &amp; Retail.
        </p>
        <div className="mt-10 grid gap-4 lg:grid-cols-3">
          {RESTAURANT_TIERS.map((t) => (
            <TierCard key={t} tier={t} featured={t === "growth"} />
          ))}
        </div>

        <div className="mt-12 grid gap-8 rounded-sheet border border-line bg-bg p-6 md:grid-cols-[1fr_1.4fr] md:p-8">
          <div>
            <Badge tone="accent">Founding restaurants</Badge>
            <h3 className="display mt-4 text-mkt-sm text-balance">{FOUNDING_OFFER.firstYearPct}% off for a year. {FOUNDING_OFFER.lifetimePct}% off for life.</h3>
          </div>
          <p className="text-body text-fg-muted">
            The first {FOUNDING_OFFER.slotsPerCorridor} restaurants on each corridor pay half price for their first 12 months, then {FOUNDING_OFFER.lifetimePct}% off every month after, for as long as they stay. Growth is {money(Math.round((RESTAURANT_PLANS.growth.priceCents * (100 - FOUNDING_OFFER.firstYearPct)) / 100))} a month in year one, then {money(Math.round((RESTAURANT_PLANS.growth.priceCents * (100 - FOUNDING_OFFER.lifetimePct)) / 100))}. Ask us if your corridor still has a spot.
          </p>
        </div>
      </MSection>

      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <div>
            <h2 className="display text-mkt-md md:text-mkt-lg">add what you need.</h2>
            <p className="mt-4 text-body text-fg-muted">Add-ons ride on your restaurant plan and are prorated to the day. Take one off any time.</p>
          </div>
          <ul className="flex flex-col divide-y divide-line border-y border-line">
            {ADD_ON_IDS.map((id) => (
              <li key={id} className="flex items-start justify-between gap-6 py-4">
                <div>
                  <p className="text-body-strong text-fg">{ADD_ONS[id].name}</p>
                  <p className="mt-0.5 text-meta text-fg-muted">{ADD_ON_NOTE[id]}</p>
                </div>
                <p className="shrink-0 text-body-strong tabular-nums text-fg">
                  {money(ADD_ONS[id].priceCents)}
                  <span className="text-meta font-normal text-fg-muted">{ADD_ONS[id].unit === "pack" ? " / pack" : " / month"}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
      </MSection>

      <MSection tone="subtle" className="md:py-24!">
        <h2 className="display text-mkt-md md:text-mkt-lg">what it costs per order.</h2>
        <p className="mt-4 max-w-2xl text-body text-fg-muted">Delivery apps commonly keep 15 to 30% of every order as commission. On a restaurant plan you pay a flat monthly price and no commission on your own online orders.</p>
        <div className="mt-8 overflow-x-auto rounded-sheet border border-line bg-bg px-5 pb-2 md:px-8">
          <table className="w-full min-w-[560px] text-meta">
            <caption className="sr-only">Fees compared with delivery apps</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="py-4 text-start">
                  <span className="sr-only">Charge</span>
                </th>
                <th scope="col" className="px-3 py-4 text-center text-body-strong text-fg">Restaurant plan</th>
                <th scope="col" className="px-3 py-4 text-center text-body-strong text-fg">DoorDash and Uber Eats</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line">
                <th scope="row" className="py-3 pe-4 text-start font-normal text-fg">Commission on online orders</th>
                <td className="px-3 py-3 text-center text-fg">{FEES.orderBpsPaid === 0 ? "None" : pct(FEES.orderBpsPaid)}</td>
                <td className="px-3 py-3 text-center text-fg-muted">About 15 to 30%</td>
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-3 pe-4 text-start font-normal text-fg">On $5,000 of orders a month</th>
                <td className="px-3 py-3 text-center text-fg">{money(RESTAURANT_PLANS.growth.priceCents)} for Growth, flat</td>
                <td className="px-3 py-3 text-center text-fg-muted">$750 to $1,500 in commission</td>
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-3 pe-4 text-start font-normal text-fg">Optional customer service fee</th>
                <td className="px-3 py-3 text-center text-fg">{formatMoney(FEES.customerServiceFeeCents)} per order, only if you turn it on</td>
                <td className="px-3 py-3 text-center text-fg-muted">Set by the app</td>
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-3 pe-4 text-start font-normal text-fg">Catering and banquet deposits, invoices</th>
                <td className="px-3 py-3 text-center text-fg">{pct(FEES.depositInvoiceBps)}</td>
                <td className="px-3 py-3 text-center text-fg-muted">Not applicable</td>
              </tr>
              <tr className="border-t border-line">
                <th scope="row" className="py-3 pe-4 text-start font-normal text-fg">Tiffin subscription billing</th>
                <td className="px-3 py-3 text-center text-fg">{pct(FEES.tiffinBps)}</td>
                <td className="px-3 py-3 text-center text-fg-muted">Not applicable</td>
              </tr>
            </tbody>
          </table>
          <p className="py-4 text-meta text-fg-muted">Card processing is Stripe&apos;s standard rate on every payment, passed through at cost. Delivery app commissions vary by plan and city; check your own statement.</p>
        </div>
      </MSection>
    </>
  );
}
