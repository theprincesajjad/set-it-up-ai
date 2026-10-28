import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { FEATURES, FEATURE_KEYS, FEES, NETWORK_GATE_SHOPS, PLANS, PLAN_RANK, type FeatureKey, type PlanId } from "@ll/shared";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { moneyShort } from "@/lib/marketing/text";

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

/** Active shops at which the first paid features open to every shop (the lowest gate among Café & Retail features). */
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

export function FreeCard() {
  return (
    <Card padding="none" className="mkt-lift flex flex-col overflow-hidden rounded-sheet border-0 p-0 shadow-card ring-2 ring-forest">
      <div className="bg-tile-mint px-6 py-4 text-tile-mint-foreground md:px-8">
        <div className="flex items-center justify-between gap-2">
          <h2 className="display text-title">{PLANS.free.name}</h2>
          <span className="inline-flex items-center rounded-full bg-forest px-3 py-1 text-meta-strong text-forest-foreground">{P.freeBadge}</span>
        </div>
      </div>
      <div className="flex flex-1 flex-col p-6 pt-5 md:p-8 md:pt-6">
      <p className="mt-5 flex items-baseline gap-2">
        <span className="display text-mkt-lg tabular-nums text-forest">$0</span>
        <span className="text-body text-muted-foreground">forever</span>
      </p>
      <p className="mt-3 text-body text-foreground">{P.freeLead}</p>
      <p className="mt-2 text-meta text-muted-foreground">Online orders on Free carry a {Number((FEES.orderBpsFree / 100).toFixed(2))}% fee; paid plans and restaurant plans carry none.</p>
      <Button href="/signup" fullWidth size="lg" className="mt-6">
        Get started free
      </Button>
      <div className="mt-8">
        <h3 className="text-meta-strong text-muted-foreground">Included</h3>
        <ul className="mt-1">
          {P.freeLines.map((l) => (
            <PlainLine key={l}>{l}</PlainLine>
          ))}
        </ul>
      </div>
      </div>
    </Card>
  );
}

/** Café & Retail and Service: the real price in the normal text colour. The badge text follows the API: no badge once the plan is available. */
export function PaidCard({ id }: { id: "plus" | "pro" }) {
  const plan = PLANS[id];
  const all = planFeatures(id);
  const keys = HIGHLIGHTS[id].filter((k) => all.includes(k));
  const more = all.length - keys.length;
  return (
    <Card padding="none" className="mkt-lift flex flex-col overflow-hidden rounded-sheet border-0 p-0 shadow-card">
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
      <p className="mt-3 text-body text-foreground">{id === "plus" ? P.plusLine : P.proLine}</p>
      <Button href={`/signup?plan=${id}`} fullWidth size="lg" className="mt-6">
        {`Start ${plan.name}`}
      </Button>
      <div className="mt-8">
        <h3 className="text-meta-strong text-muted-foreground">{id === "plus" ? "Everything in Free, plus" : "Everything in Café & Retail, plus"}</h3>
        <ul className="mt-1">
          {keys.map((k) => (
            <FeatureLine key={k} k={k} />
          ))}
        </ul>
        {more > 0 ? (
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

