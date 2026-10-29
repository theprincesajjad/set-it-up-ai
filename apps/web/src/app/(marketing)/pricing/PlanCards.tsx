import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { FEATURES, FEATURE_KEYS, FEES, NETWORK_GATE_SHOPS, PLANS, PLAN_RANK, PROMOS_PER_MONTH_PLUS, PROMOS_PER_YEAR_ANNUAL, SMS_OVERAGE_CENTS, type FeatureKey, type PlanId, type billingApi } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { SOLO_COMPETITORS } from "@/lib/marketing/competitors-solo";
import { fill, moneyShort } from "@/lib/marketing/text";

const P = copy.pricing;

/** Plan features shown on the cards and in the table (platform levers, per-campaign ads and the restaurant pack, which has its own tiers, are not shop plan features). */
export const PLAN_FEATURES = FEATURE_KEYS.filter((k) => !FEATURES[k].platform && !FEATURES[k].pack && FEATURES[k].phase !== 3);
const planFeatures = (id: PlanId) => PLAN_FEATURES.filter((k) => FEATURES[k].minPlan === id);

/** What a paid card lists before "and N more": the features owners ask about first. Names come from FEATURES. */
const HIGHLIGHTS: Record<"plus" | "pro", FeatureKey[]> = {
  plus: ["booking.appointments", "booking.classes", "booking.walkin_queue", "memberships.recurring", "orders.order_ahead", "promos.basic", "marketing.sms", "integrations.pos_auto_award"],
  pro: ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices", "booking.dropoff_scheduling", "staff.permissions"],
};

/** Comparison table sections. */
const TABLE_GROUPS: { title: string; match: (k: FeatureKey) => boolean }[] = [
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
/** Template values every solo-pricing line can use; all from plans.ts, never typed by hand. */
export const soloVars = {
  promos: PROMOS_PER_MONTH_PLUS,
  promosYear: PROMOS_PER_YEAR_ANNUAL,
  texts: PLANS.plus.smsPerMonth.toLocaleString("en-CA"),
  freeTexts: PLANS.free.smsPerMonth,
  overage: `${SMS_OVERAGE_CENTS}¢`,
  monthly: moneyShort(PLANS.plus.priceCents),
};

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

/**
 * Pro monthly (id "plus") with the §3.2 lines, or Service (id "pro") with its own highlights. Real prices in the
 * normal text colour; the Start button goes to signup with the plan.
 */
export function PaidCard({ id }: { id: "plus" | "pro" }) {
  const plan = PLANS[id];
  const all = planFeatures(id);
  const keys = HIGHLIGHTS[id].filter((k) => all.includes(k));
  const more = all.length - keys.length;
  return (
    <Card padding="none" className="mkt-lift flex flex-col overflow-hidden rounded-sheet border-0 p-0 shadow-card" data-plan={id}>
      <div className={cn("px-6 py-4 md:px-8", id === "plus" ? "bg-tile-peach text-tile-peach-foreground" : "bg-tile-lilac text-tile-lilac-foreground")}>
        <h2 className="display text-title">{plan.name}</h2>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-5 md:p-8 md:pt-6">
        <p className="mt-5 flex items-baseline gap-2">
          <span className="display text-mkt-lg tabular-nums text-primary-text">{price(id)}</span>
          <span className="text-body text-muted-foreground">/month</span>
        </p>
        <p className="text-meta text-muted-foreground">
          or {moneyShort(plan.annualPriceCents)} a year · {plan.smsPerMonth.toLocaleString("en-CA")} texts a month
        </p>
        <p className="mt-3 text-body text-foreground">{id === "plus" ? S.monthly.lead : P.proLine}</p>
        <Button href={`/signup?plan=${id}`} fullWidth size="lg" className="mt-6">
          {`Start ${plan.name}`}
        </Button>
        <div className="mt-8">
          <h3 className="text-meta-strong text-muted-foreground">{id === "plus" ? "Everything in Free, plus" : "Everything in Pro, plus"}</h3>
          <ul className="mt-1">
            {id === "plus" ? S.monthly.lines.map((l) => <PlainLine key={l}>{fill(l, soloVars)}</PlainLine>) : keys.map((k) => <FeatureLine key={k} k={k} />)}
          </ul>
          {id === "pro" && more > 0 ? (
            <p className="mt-2 text-meta text-muted-foreground">
              and {more} more.{" "}
              <Link href="/pricing?compare=1#compare" className="text-foreground underline decoration-input/60 underline-offset-2 hover:decoration-foreground">
                Compare every feature
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** The annual plan: Pro paid yearly, plus the website (ANNUAL_INCLUDES_WEBSITE), and the founding strip when it is on. */
export function AnnualCard({ founding }: { founding: billingApi.FoundingSoloDto | null }) {
  const plan = PLANS.plus;
  return (
    <Card padding="none" className="mkt-lift flex flex-col overflow-hidden rounded-sheet border-0 p-0 shadow-card" data-plan="annual">
      <div className="bg-tile-sky px-6 py-4 text-tile-sky-foreground md:px-8">
        <h2 className="display text-title">{S.annual.title}</h2>
        <p className="text-meta">{S.annual.sub}</p>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-5 md:p-8 md:pt-6">
        <p className="mt-5 flex items-baseline gap-2">
          <span className="display text-mkt-lg tabular-nums text-primary-text">{moneyShort(plan.annualPriceCents)}</span>
          <span className="text-body text-muted-foreground">{S.annual.per}</span>
        </p>
        <p className="text-meta text-muted-foreground">{S.annual.saving}</p>
        <p className="mt-3 text-body text-foreground">{S.annual.lead}</p>
        {founding ? <FoundingStrip founding={founding} className="mt-4" /> : null}
        <Button href="/signup?plan=plus&interval=year" fullWidth size="lg" className="mt-6">
          {S.annual.cta}
        </Button>
        <div className="mt-8">
          <h3 className="text-meta-strong text-muted-foreground">{S.annual.lines[0]}, plus</h3>
          <ul className="mt-1">
            {S.annual.lines.slice(1).map((l) => (
              <PlainLine key={l}>{fill(l, soloVars)}</PlainLine>
            ))}
          </ul>
        </div>
      </div>
    </Card>
  );
}

/** "Founding pro · $290 for your first year, then $390 · 143 of 200 spots left". Renders nothing when the offer is off. */
export function FoundingStrip({ founding, className }: { founding: billingApi.FoundingSoloDto; className?: string }) {
  if (!founding.enabled) return null;
  const vars = { price: moneyShort(founding.priceCents), renews: moneyShort(founding.renewsAtCents), slots: founding.slots, n: founding.spotsLeft };
  return (
    <div className={cn("rounded-card bg-tile-butter p-4 text-tile-butter-foreground", className)} data-testid="founding-strip">
      <p className="text-meta-strong">{S.founding.badge} · {fill(S.founding.spots, vars)}</p>
      <p className="mt-1 text-body-strong">{founding.spotsLeft > 0 ? fill(S.founding.title, vars) : S.founding.gone}</p>
      <p className="mt-1 text-meta">{fill(S.founding.body, vars)}</p>
    </div>
  );
}

/** Service for repair shops, kept as one line under the three solo plans. */
export function ServiceLine() {
  return (
    <div className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card md:flex-row md:items-center md:justify-between md:px-8" data-plan="pro">
      <p className="text-body text-foreground">{S.service.line}</p>
      <div className="flex shrink-0 items-center gap-4">
        <p className="flex items-baseline gap-1">
          <span className="text-title tabular-nums text-primary-text">{price("pro")}</span>
          <span className="text-meta text-muted-foreground">{S.service.per}</span>
        </p>
        <Button href="/signup?plan=pro" variant="secondary">
          {S.service.cta}
        </Button>
      </div>
    </div>
  );
}

/** The §3.2 table, row for row: Free, Pro monthly and the annual plan. */
export function SoloTable() {
  const cols = [
    { key: "free", name: PLANS.free.name, price: "$0" },
    { key: "monthly", name: PLANS.plus.name, price: `${moneyShort(PLANS.plus.priceCents)}/mo` },
    { key: "annual", name: S.annual.title, price: `${moneyShort(PLANS.plus.annualPriceCents)}/yr` },
  ] as const;
  return (
    <div className="overflow-x-auto" data-testid="solo-table">
      <table className="w-full min-w-[640px] text-meta">
        <caption className="sr-only">{S.table.caption}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-4 text-start">
              <span className="sr-only">{S.table.feature}</span>
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
          {S.table.rows.map((r) => (
            <tr key={r.label} className="border-t border-border align-top">
              <th scope="row" className="py-3 pe-4 text-start font-normal text-foreground">
                {r.label}
              </th>
              {cols.map((c) => {
                const v = fill(r[c.key], soloVars);
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
    { label: S.compare.rowPrice, us: fill(S.compare.usPrice, soloVars), key: "price" },
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
  const plans: PlanId[] = ["free", "plus", "pro"];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-meta">
        <caption className="sr-only">Compare plans</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-4 text-start">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th key={p} scope="col" className="w-[18%] px-3 py-4 text-center">
                <span className="block text-body-strong text-foreground">{PLANS[p].name}</span>
                <span className="block font-normal text-muted-foreground">
                  {p === "free" ? "$0" : `${price(p)}/mo`}
                  {p !== "free" && !available[p] ? " · early access" : ""}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {TABLE_GROUPS.map((g) => {
          const keys = PLAN_FEATURES.filter(g.match);
          if (!keys.length) return null;
          return (
            <tbody key={g.title}>
              <tr>
                <th colSpan={4} scope="colgroup" className="pt-8 pb-2 text-start text-meta-strong text-foreground">
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
            <td colSpan={2} className="px-3 py-3 text-center text-muted-foreground">
              On in-app payments only
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

