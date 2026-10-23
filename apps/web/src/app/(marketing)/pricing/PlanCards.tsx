import { Check, Minus } from "lucide-react";
import Link from "next/link";
import { FEATURES, FEATURE_KEYS, PLANS, PLAN_RANK, type FeatureKey, type PlanId } from "@ll/shared";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { cn } from "@/lib/cn";
import { moneyShort } from "@/lib/marketing/text";

const P = copy.pricing;

/** Plan features shown on the cards and in the table (platform levers, per-campaign ads and the restaurant pack, which has its own tiers, are not shop plan features). */
export const PLAN_FEATURES = FEATURE_KEYS.filter((k) => !FEATURES[k].platform && !FEATURES[k].pack && FEATURES[k].phase !== 3);
const planFeatures = (id: PlanId) => PLAN_FEATURES.filter((k) => FEATURES[k].minPlan === id);

/** What a paid card lists before "and N more": the features owners ask about first. Names come from FEATURES. */
const HIGHLIGHTS: Record<"plus" | "pro", FeatureKey[]> = {
  plus: ["promos.basic", "loyalty.vip_levels", "marketing.email", "marketing.sms", "integrations.pos_auto_award", "orders.order_ahead"],
  pro: ["service.tickets", "service.quote_approval", "service.deposits", "service.invoices", "booking.dropoff_scheduling", "staff.permissions"],
};

/** Comparison table sections. */
const TABLE_GROUPS: { title: string; match: (k: FeatureKey) => boolean }[] = [
  { title: "Loyalty", match: (k) => k.startsWith("loyalty.") || k === "discount_cards" },
  { title: "Customers and reports", match: (k) => k.startsWith("customers.") || k.startsWith("reports.") },
  { title: "Network", match: (k) => k.startsWith("network.") || k.startsWith("wallet.") },
  { title: "Promos and marketing", match: (k) => k.startsWith("promos.") || k.startsWith("marketing.") },
  { title: "Integrations", match: (k) => k.startsWith("integrations.") },
  { title: "Orders and payments", match: (k) => k.startsWith("orders.") || k.startsWith("payments.") || k === "booking.pickup_slots" },
  { title: "Repair and service", match: (k) => k.startsWith("service.") || k === "booking.dropoff_scheduling" },
  { title: "Team", match: (k) => k.startsWith("staff.") || k.startsWith("locations.") },
];

const PAID = PLAN_FEATURES.filter((k) => FEATURES[k].minPlan !== "free");
/** Active shops at which the first paid features open to every shop (the lowest gate among Café & Retail features). */
export const PLUS_TARGET = Math.min(...PAID.filter((k) => FEATURES[k].minPlan === "plus").map((k) => FEATURES[k].unlockAtMerchants).filter((n) => n > 0), 100);

export const price = (id: PlanId) => (id === "free" ? "$0" : moneyShort(PLANS[id].priceCents));

function FeatureLine({ k }: { k: FeatureKey }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-meta">
      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" strokeWidth={2} />
      <span className="text-fg">{FEATURES[k].name}</span>
    </li>
  );
}

function PlainLine({ children }: { children: string }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-meta">
      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg" strokeWidth={2} />
      <span className="text-fg">{children}</span>
    </li>
  );
}

export function FreeCard() {
  return (
    <div className="flex flex-col rounded-sheet border-[1.5px] border-fg bg-bg p-6 md:p-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-headline text-fg">{PLANS.free.name}</h2>
        <Badge tone="accent">{P.freeBadge}</Badge>
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="display text-mkt-lg tabular-nums">$0</span>
        <span className="text-body text-fg-muted">forever</span>
      </p>
      <p className="mt-3 text-body text-fg">{P.freeLead}</p>
      <Button href="/signup" fullWidth size="lg" className="mt-6">
        Get started free
      </Button>
      <div className="mt-8">
        <h3 className="text-meta-strong text-fg-muted">Included</h3>
        <ul className="mt-1">
          {P.freeLines.map((l) => (
            <PlainLine key={l}>{l}</PlainLine>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Café & Retail and Service: the real price in the normal text colour. The badge text follows the API: no badge once the plan is available. */
export function PaidCard({ id, available }: { id: "plus" | "pro"; available: boolean }) {
  const plan = PLANS[id];
  const all = planFeatures(id);
  const keys = HIGHLIGHTS[id].filter((k) => all.includes(k));
  const more = all.length - keys.length;
  return (
    <div className="flex flex-col rounded-sheet border border-line bg-bg p-6 md:p-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-headline text-fg">{plan.name}</h2>
        {available ? null : <Badge tone="neutral">{P.pilotBadge}</Badge>}
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="display text-mkt-lg tabular-nums text-fg">{price(id)}</span>
        <span className="text-body text-fg-muted">/month</span>
      </p>
      <p className="text-meta text-fg-muted">
        or {moneyShort(plan.annualPriceCents)} a year · {plan.smsPerMonth.toLocaleString("en-CA")} texts a month
      </p>
      <p className="mt-3 text-body text-fg">{id === "plus" ? P.plusLine : P.proLine}</p>
      {available ? (
        <Button href="/signup" fullWidth size="lg" className="mt-6">
          {`Start ${plan.name}`}
        </Button>
      ) : (
        <Button variant="secondary" fullWidth size="lg" href="/signup" className="mt-6">
          {P.pilotCta}
        </Button>
      )}
      <div className="mt-8">
        <h3 className="text-meta-strong text-fg-muted">{id === "plus" ? "Everything in Free, plus" : "Everything in Café & Retail, plus"}</h3>
        <ul className="mt-1">
          {keys.map((k) => (
            <FeatureLine key={k} k={k} />
          ))}
        </ul>
        {more > 0 ? (
          <p className="mt-2 text-meta text-fg-muted">
            and {more} more.{" "}
            <Link href="/pricing?compare=1#compare" className="text-fg underline decoration-line-strong/60 underline-offset-2 hover:decoration-fg">
              Compare every feature
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Cell({ on, soon }: { on: boolean; soon?: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      {on ? <Check aria-label={soon ? "Included, pilot shops now" : "Included"} className={cn("mx-auto size-4", soon ? "text-fg-subtle" : "text-fg")} strokeWidth={2.25} /> : <Minus aria-label="Not included" className="mx-auto size-4 text-line-strong/50" strokeWidth={1.75} />}
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
          <tr className="border-b border-line">
            <th scope="col" className="py-4 text-start">
              <span className="sr-only">Feature</span>
            </th>
            {plans.map((p) => (
              <th key={p} scope="col" className="w-[18%] px-3 py-4 text-center">
                <span className="block text-body-strong text-fg">{PLANS[p].name}</span>
                <span className="block font-normal text-fg-muted">
                  {p === "free" ? "$0" : `${price(p)}/mo`}
                  {p !== "free" && !available[p] ? " · pilot shops" : ""}
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
                <th colSpan={4} scope="colgroup" className="pt-8 pb-2 text-start text-meta-strong text-fg">
                  {g.title}
                </th>
              </tr>
              {keys.map((k) => {
                const f = FEATURES[k];
                return (
                  <tr key={k} className="border-t border-line">
                    <th scope="row" className="py-3 pe-4 text-start font-normal">
                      <span className="text-fg">{f.name}</span>
                      <span className="block text-fg-muted">{f.description}</span>
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
          <tr className="border-t border-line">
            <th scope="row" className="py-3 pe-4 text-start font-normal text-fg">
              Transaction fee
            </th>
            <td className="px-3 py-3 text-center text-fg">None</td>
            <td colSpan={2} className="px-3 py-3 text-center text-fg-muted">
              On in-app payments only
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

