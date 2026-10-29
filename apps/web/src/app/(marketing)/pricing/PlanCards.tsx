import { Check, Minus } from "lucide-react";
import Link from "next/link";
import {
  FEATURES,
  FEATURE_KEYS,
  FEES,
  NETWORK_GATE_SHOPS,
  PLANS,
  PLAN_RANK,
  PRO_BOOKABLE_CALENDARS,
  PROMOS_PER_MONTH_PLUS,
  PROMOS_PER_MONTH_STUDIO,
  PROMOS_PER_YEAR_ANNUAL,
  PROMOS_PER_YEAR_STUDIO_ANNUAL,
  RESTAURANT_PLANS,
  RESTAURANT_TIERS,
  SMS_OVERAGE_CENTS,
  TRIAL_DAYS,
  type FeatureKey,
  type PlanId,
  type billingApi,
} from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { SOLO_COMPETITORS } from "@/lib/marketing/competitors-solo";
import { marketingPlans, planLine } from "@/lib/marketing/plan-copy";
import { fill, moneyShort } from "@/lib/marketing/text";

const P = copy.pricing;

/** Plan features shown on the cards and in the table (platform levers, per-campaign ads and the restaurant pack, which has its own tiers, are not shop plan features). */
export const PLAN_FEATURES = FEATURE_KEYS.filter((k) => !FEATURES[k].platform && !FEATURES[k].pack && FEATURES[k].phase !== 3);
const planFeatures = (id: PlanId) => PLAN_FEATURES.filter((k) => FEATURES[k].minPlan === id);

/** phase-pro P1: the four money features of Pro (pro-value.md §2.2), grouped first in the comparison table. */
const FILLS_YOUR_BOOK: readonly FeatureKey[] = ["booking.waitlist", "service.rebooking", "booking.review_requests", "booking.add_ons", "insights.weekly"];

/** Comparison table sections. A key lands in the first group it matches. */
const TABLE_GROUPS: { title: string; match: (k: FeatureKey) => boolean }[] = [
  { title: copy.proPricing.groups.fills, match: (k) => FILLS_YOUR_BOOK.includes(k) },
  // Studio's own features (minPlan studio), whatever their trade.
  { title: copy.proPricing.groups.shops, match: (k) => FEATURES[k].minPlan === "studio" },
  { title: "Loyalty", match: (k) => k.startsWith("loyalty.") || k === "discount_cards" },
  { title: "Customers and reports", match: (k) => k.startsWith("customers.") || k.startsWith("reports.") },
  { title: "Network", match: (k) => k.startsWith("network.") || k.startsWith("wallet.") },
  { title: "Promos and marketing", match: (k) => k.startsWith("promos.") || k.startsWith("marketing.") },
  { title: "Integrations", match: (k) => k.startsWith("integrations.") },
  { title: "Booking, classes and the walk-in line", match: (k) => k.startsWith("booking.") && k !== "booking.pickup_slots" && k !== "booking.dropoff_scheduling" || k === "service.rebooking" || k.startsWith("memberships.") || k === "staff.payouts" },
  { title: "Grocers and butchers", match: (k) => k.startsWith("grocery.") },
  { title: "Pet shops", match: (k) => k.startsWith("pets.") },
  { title: "Auto care", match: (k) => k.startsWith("auto.") },
  { title: "Orders and payments", match: (k) => k.startsWith("orders.") || k.startsWith("payments.") || k === "booking.pickup_slots" },
  { title: "Repair and service", match: (k) => k.startsWith("service.") || k === "booking.dropoff_scheduling" },
  { title: "Team", match: (k) => (k.startsWith("staff.") && k !== "staff.payouts") || k.startsWith("locations.") },
];

/** Active shops at which the first paid features open to every shop (the lowest gate among Pro features). */
export const PLUS_TARGET = NETWORK_GATE_SHOPS;

export const price = (id: PlanId) => (id === "free" ? "$0" : moneyShort(PLANS[id].priceCents));

/** The first group a feature matches (a feature shows once). */
const groupOf = (k: FeatureKey) => TABLE_GROUPS.findIndex((g) => g.match(k));

function FeatureLine({ k }: { k: FeatureKey }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-meta">
      <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-tile-mint text-tile-mint-foreground"><Check className="size-3" strokeWidth={3} /></span>
      <span className="text-foreground">{FEATURES[k].name}</span>
    </li>
  );
}

function PlainLine({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-meta">
      <span aria-hidden className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-tile-mint text-tile-mint-foreground"><Check className="size-3" strokeWidth={3} /></span>
      <span className="text-foreground">{children}</span>
    </li>
  );
}

const S = copy.soloPricing;
const PP = copy.proPricing;
/** Template values every pricing line can use; all from plans.ts, never typed by hand. */
export const soloVars = {
  free: PLANS.free.name,
  pro: PLANS.plus.name,
  studio: PLANS.studio.name,
  service: PLANS.pro.name,
  trial: TRIAL_DAYS,
  promos: PROMOS_PER_MONTH_PLUS,
  promosYear: PROMOS_PER_YEAR_ANNUAL,
  studioPromos: PROMOS_PER_MONTH_STUDIO,
  studioPromosYear: PROMOS_PER_YEAR_STUDIO_ANNUAL,
  proCalendars: PRO_BOOKABLE_CALENDARS,
  texts: PLANS.plus.smsPerMonth.toLocaleString("en-CA"),
  studioTexts: PLANS.studio.smsPerMonth.toLocaleString("en-CA"),
  freeTexts: PLANS.free.smsPerMonth,
  overage: `${SMS_OVERAGE_CENTS}¢`,
  monthly: moneyShort(PLANS.plus.priceCents),
  studioMonthly: moneyShort(PLANS.studio.priceCents),
  serviceMonthly: moneyShort(PLANS.pro.priceCents),
  restaurantPrices: RESTAURANT_TIERS.map((t) => moneyShort(RESTAURANT_PLANS[t].priceCents)).join(", ").replace(/, ([^,]+)$/, " and $1"),
};
export const pv = (s: string) => fill(s, soloVars);

/** Free (solo-pro-launch.md §3.2): one bookable calendar, deposits, reminders and the loyalty program. */
export function FreeCard() {
  return (
    <Card padding="none" className="mkt-lift flex flex-col overflow-hidden rounded-sheet border-0 p-0 shadow-card ring-2 ring-forest" data-plan="free">
      <div className="bg-tile-mint px-6 py-4 text-tile-mint-foreground md:px-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="display text-title">{PLANS.free.name}</h2>
          <span className="inline-flex items-center rounded-full bg-forest px-3 py-1 text-meta-strong text-forest-foreground">{P.freeBadge}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-5 md:p-8 md:pt-6">
        <p className="mt-5 flex items-baseline gap-2">
          <span className="display text-mkt-lg tabular-nums text-forest">$0</span>
          <span className="text-body text-muted-foreground">{S.free.per}</span>
        </p>
        <p className="mt-3 text-body text-foreground">{S.free.lead}</p>
        <p className="mt-2 text-meta text-muted-foreground">Online orders on Free carry a {Number((FEES.orderBpsFree / 100).toFixed(2))}% fee; paid plans and restaurant plans carry none.</p>
        <Button href="/signup" fullWidth size="lg" className="mt-6">
          {S.free.cta}
        </Button>
        <div className="mt-8">
          <h3 className="text-meta-strong text-muted-foreground">Included</h3>
          <ul className="mt-1">
            {S.free.lines.map((l) => (
              <PlainLine key={l}>{l}</PlainLine>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** "or ~~$290~~ $199 first year, billed yearly": the first-year price as a struck-through number, never named. */
export function YearlyLine({ id, firstYear }: { id: "plus" | "studio"; firstYear: billingApi.FirstYearPriceDto | null }) {
  const plan = PLANS[id];
  const card = marketingPlans("solo").find((c) => c.key === (id === "plus" ? "monthly" : "studio"));
  if (id === "plus" && firstYear?.shown && firstYear.priceCents < firstYear.listPriceCents && card?.yearly) {
    return (
      <p className="text-meta text-muted-foreground" data-testid="first-year-price">
        {card.yearly.or ?? "or"}{" "}
        <span className="sr-only">regular price </span>
        <s className="tabular-nums">{moneyShort(firstYear.listPriceCents)}</s>
        <span className="sr-only">, now</span> <span className="text-meta-strong tabular-nums text-foreground">{moneyShort(firstYear.priceCents)}</span> {card.yearly.label}
      </p>
    );
  }
  return <p className="text-meta text-muted-foreground">{card?.yearly?.line ?? `or ${moneyShort(plan.annualPriceCents)} a year`}</p>;
}

/**
 * Pro (id "plus") and Studio (id "studio"): the words from the marketing plan copy (lib/marketing/plan-copy.ts), the numbers from
 * PLANS. Pro carries the trial line and the first-year price.
 */
export function PaidCard({ id, firstYear }: { id: "plus" | "studio"; firstYear: billingApi.FirstYearPriceDto | null }) {
  const plan = PLANS[id];
  const card = marketingPlans("solo").find((c) => c.key === (id === "plus" ? "monthly" : "studio"))!;
  const pro = id === "plus";
  return (
    <Card padding="none" className={cn("mkt-lift flex flex-col overflow-hidden rounded-sheet border-0 p-0 shadow-card", pro && "ring-2 ring-primary")} data-plan={id}>
      <div className={cn("px-6 py-4 md:px-8", pro ? "bg-tile-peach text-tile-peach-foreground" : "bg-tile-lilac text-tile-lilac-foreground")}>
        <div className="flex items-center justify-between gap-2">
          <h2 className="display text-title">{plan.name}</h2>
          {pro && card.badge ? <span className="inline-flex items-center rounded-full bg-card px-3 py-1 text-meta-strong text-foreground">{card.badge}</span> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-5 md:p-8 md:pt-6">
        <p className="mt-5 flex items-baseline gap-2">
          <span className="display text-mkt-lg tabular-nums text-primary-text">{price(id)}</span>
          <span className="text-body text-muted-foreground">{S.monthly.per}</span>
        </p>
        <YearlyLine id={id} firstYear={firstYear} />
        <p className="mt-1 text-meta text-muted-foreground">{pv(pro ? PP.proCalendars : PP.studioCalendars)}</p>
        <p className="mt-3 text-body text-foreground">{card.tagline}</p>
        {/* Pro starts as the 14-day trial (no card: it begins when the booking link goes live); Studio opens its checkout after signup. */}
        <Button href={pro ? "/signup" : `/signup?plan=${id}`} fullWidth size="lg" className="mt-6">
          {pro ? planLine("trialCta") : pv(PP.studioCta)}
        </Button>
        {pro ? (
          <p className="mt-2 text-center text-meta-strong text-foreground" data-testid="trial-line">
            {pv(PP.trialLine)}
          </p>
        ) : null}
        <div className="mt-8">
          <h3 className="text-meta-strong text-muted-foreground">{pv(pro ? PP.proHeading : PP.studioHeading)}</h3>
          <ul className="mt-1">
            {card.features.filter((l) => !(!pro && l.startsWith("Everything in"))).map((l) => (
              <PlainLine key={l}>{l}</PlainLine>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** Service for repair shops, kept as one line under the three plans. */
export function ServiceLine() {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card md:flex-row md:items-center md:justify-between md:px-8" data-plan="pro">
      <p className="text-body text-foreground">{pv(PP.serviceLine)}</p>
      <div className="flex shrink-0 items-center gap-4">
        <p className="flex items-baseline gap-1">
          <span className="text-title tabular-nums text-primary-text">{price("pro")}</span>
          <span className="text-meta text-muted-foreground">{S.service.per}</span>
        </p>
        <Button href="/signup?plan=pro" variant="secondary">
          {pv(PP.serviceCta)}
        </Button>
      </div>
    </div>
  );
}

/** pro-value.md §2.2, row for row: Free, Pro and Studio. Horizontal scroll on a phone, the first column stays put. */
export function SoloTable() {
  const cols = [
    { key: "free", name: PLANS.free.name, price: "$0" },
    { key: "pro", name: PLANS.plus.name, price: `${moneyShort(PLANS.plus.priceCents)}/mo` },
    { key: "studio", name: PLANS.studio.name, price: `${moneyShort(PLANS.studio.priceCents)}/mo` },
  ] as const;
  return (
    <div className="overflow-x-auto" data-testid="solo-table">
      <table className="w-full min-w-[640px] text-meta">
        <caption className="sr-only">{pv(PP.table.caption)}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="sticky start-0 z-10 bg-card py-4 text-start">
              <span className="sr-only">{PP.table.feature}</span>
            </th>
            {cols.map((c) => (
              <th key={c.key} scope="col" className="w-[22%] px-3 py-4 text-start">
                <span className="block text-body-strong text-foreground">{c.name}</span>
                <span className="block font-normal tabular-nums text-muted-foreground">{c.price}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PP.table.rows.map((r) => (
            <tr key={r.label} className="border-t border-border align-top">
              <th scope="row" className="sticky start-0 z-10 bg-card py-3 pe-4 text-start font-normal text-foreground">
                {r.label}
              </th>
              {cols.map((c) => {
                const v = pv(r[c.key]);
                return (
                  <td key={c.key} className={cn("px-3 py-3", v === "No" ? "text-muted-foreground" : "text-foreground")}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const TAG_WORD = { W: S.compare.tagW, "W?": S.compare.tagWq, H: S.compare.tagH } as const;

/** Against Fresha, Booksy and Square on price, deposits and the new-client fee, every figure with its date and source. */
export function CompareStrip() {
  const asOf = SOLO_COMPETITORS[0]?.asOf ?? "";
  const date = asOf ? new Date(`${asOf}T12:00:00Z`).toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "";
  const rows = [
    { label: S.compare.rowPrice, us: pv(S.compare.usPrice), key: "price" },
    { label: S.compare.rowDeposit, us: S.compare.usDeposit, key: "deposit" },
    { label: S.compare.rowNewClient, us: S.compare.usNewClient, key: "newClient" },
  ] as const;
  return (
    <div data-testid="solo-compare">
      <p className="text-meta-strong text-primary-text">{S.compare.eyebrow}</p>
      <h2 className="display mt-3 text-mkt-md md:text-mkt-lg">{S.compare.title}</h2>
      <ul className="mt-8 grid gap-3 md:grid-cols-4">
        <li className="rounded-card bg-card p-5 shadow-card ring-2 ring-forest">
          <p className="text-body-strong text-foreground">{S.compare.us}</p>
          <dl className="mt-3 flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.key}>
                <dt className="text-meta text-muted-foreground">{r.label}</dt>
                <dd className="text-meta text-foreground">{r.us}</dd>
              </div>
            ))}
          </dl>
        </li>
        {SOLO_COMPETITORS.map((c) => (
          <li key={c.id} className="rounded-card bg-card p-5 shadow-card">
            <p className="text-body-strong text-foreground">{c.name}</p>
            <dl className="mt-3 flex flex-col gap-3">
              {rows.map((r) => (
                <div key={r.key}>
                  <dt className="text-meta text-muted-foreground">{r.label}</dt>
                  <dd className="text-meta text-foreground">
                    {c.cells[r.key].text} <span className="text-muted-foreground">({TAG_WORD[c.cells[r.key].tag]}, {c.cells[r.key].note})</span>
                  </dd>
                </div>
              ))}
            </dl>
            <a href={c.sourceUrl} className="mt-3 inline-flex min-h-11 items-center text-meta text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
              {c.host} · {date}
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-meta text-muted-foreground">{fill(S.compare.asOf, { date })}</p>
    </div>
  );
}

function Cell({ on, soon }: { on: boolean; soon?: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      {on ? <Check aria-label={soon ? "Included, early access" : "Included"} className={cn("mx-auto size-4", soon ? "text-muted-foreground" : "text-foreground")} strokeWidth={2.25} /> : <Minus aria-label="Not included" className="mx-auto size-4 text-input/50" strokeWidth={1.75} />}
    </td>
  );
}

export function CompareTable({ available }: { available: Record<PlanId, boolean> }) {
  const plans: PlanId[] = ["free", "plus", "studio", "pro"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-meta">
        <caption className="sr-only">Compare plans</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-4 text-start">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th key={p} scope="col" className="w-[15%] px-3 py-4 text-center">
                <span className="block text-body-strong text-foreground">{PLANS[p].name}</span>
                <span className="block font-normal text-muted-foreground">
                  {p === "free" ? "$0" : `${price(p)}/mo`}
                  {p !== "free" && !available[p] ? " · early access" : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {TABLE_GROUPS.map((g, gi) => {
          const keys = PLAN_FEATURES.filter((k) => groupOf(k) === gi);
          if (!keys.length) return null;
          return (
            <tbody key={g.title}>
              <tr>
                <th colSpan={plans.length + 1} scope="colgroup" className="pt-8 pb-2 text-start text-meta-strong text-foreground">
                  {g.title}
                </th>
              </tr>
              {keys.map((k) => {
                const f = FEATURES[k];
                return (
                  <tr key={k} className="border-t border-border">
                    <th scope="row" className="py-3 pe-4 text-start font-normal">
                      <span className="text-foreground">{f.name}</span>
                      <span className="block text-muted-foreground">{f.description}</span>
                      {f.networkGated ? <span className="mt-0.5 block text-muted-foreground">Opens once {f.unlockAtMerchants} shops have joined.</span> : null}
                    </th>
                    {plans.map((p) => (
                      <Cell key={p} on={PLAN_RANK[p] >= PLAN_RANK[f.minPlan]} soon={p !== "free" && !available[p] && f.minPlan !== "free"} />
                    ))}
                  </tr>
                );
              })}
            </tbody>
          );
        })}
        <tbody>
          <tr className="border-t border-border">
            <th scope="row" className="py-3 pe-4 text-start font-normal text-foreground">
              Transaction fee
            </th>
            <td className="px-3 py-3 text-center text-foreground">None</td>
            <td colSpan={plans.length - 1} className="px-3 py-3 text-center text-muted-foreground">
              On in-app payments only
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

