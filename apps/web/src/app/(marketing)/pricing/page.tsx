import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import { FEATURES, FEATURE_KEYS, FREE_FOREVER, PLANS, PLAN_RANK, PLATFORM_PAYMENT_FEE_BPS, isPlanAvailable, type FeatureKey, type PlanId } from "@ll/shared";
import { Faq } from "@/components/marketing/Faq";
import { MSection } from "@/components/marketing/Section";
import { Badge, ComingSoonBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { RestaurantPricing } from "./RestaurantPricing";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free forever: your loyalty program and its reports, unlimited locations and staff, no transaction fees. Plus and Pro add marketing, automations, payments and repair tools, coming soon. Restaurants: Starter $99, Growth $199, Pro $349 a month with no commission on online orders.",
  alternates: { canonical: "/pricing" },
};

/** Plan features shown on the cards and in the table (platform levers and per-campaign ads are not plan features). */
const PLAN_FEATURES = FEATURE_KEYS.filter((k) => !FEATURES[k].platform && FEATURES[k].phase !== 3);
const planFeatures = (id: PlanId) => PLAN_FEATURES.filter((k) => FEATURES[k].minPlan === id);

/** What Free includes, in the order a shop owner thinks about it (from FREE_FOREVER, so it can't drift from gating). */
const FREE_GROUPS: { title: string; match: (k: FeatureKey) => boolean }[] = [
  { title: "Your loyalty program", match: (k) => k.startsWith("loyalty.") },
  { title: "Customers and reports", match: (k) => k.startsWith("customers.") || k.startsWith("reports.") },
  { title: "On the network", match: (k) => k.startsWith("network.") || k.startsWith("wallet.") },
  { title: "Your team", match: (k) => k.startsWith("staff.") || k.startsWith("locations.") },
];

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
const PLUS_TARGET = Math.min(...PAID.filter((k) => FEATURES[k].minPlan === "plus").map((k) => FEATURES[k].unlockAtMerchants).filter((n) => n > 0), 100);

/** Real plan availability + network stats from GET /v1/public/plans; shared defaults when the API is down. */
async function publicPlans(): Promise<{ available: Record<PlanId, boolean>; progress: { current: number; target: number; neighbourhoods: number } | null }> {
  try {
    const r = await publicServerApi().public.plans();
    const available = { free: true, plus: false, pro: false } as Record<PlanId, boolean>;
    for (const p of r.items) available[p.id] = p.available;
    return { available, progress: { current: r.network.activeMerchants, target: PLUS_TARGET, neighbourhoods: r.network.neighbourhoods } };
  } catch {
    return { available: { free: true, plus: isPlanAvailable("plus", {}), pro: isPlanAvailable("pro", {}) }, progress: null };
  }
}

function price(id: PlanId) {
  return id === "free" ? "$0" : formatMoney(PLANS[id].priceCents).replace(".00", "");
}

function FeatureLine({ k, muted }: { k: FeatureKey; muted?: boolean }) {
  return (
    <li className="flex gap-2.5 py-1.5 text-meta">
      <Check aria-hidden className={cn("mt-0.5 size-4 shrink-0", muted ? "text-fg-subtle" : "text-fg")} strokeWidth={2} />
      <span className={muted ? "text-fg-muted" : "text-fg"}>{FEATURES[k].name}</span>
    </li>
  );
}

function FreeCard() {
  return (
    <div className="flex flex-col rounded-sheet border-[1.5px] border-fg bg-bg p-6 md:p-8 lg:col-span-1">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-headline text-fg">{PLANS.free.name}</h2>
        <Badge tone="brand">Every shop</Badge>
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className="display text-mkt-lg tabular-nums">$0</span>
        <span className="text-body text-fg-muted">forever</span>
      </p>
      <p className="mt-3 text-body text-fg">Your loyalty program and the reporting on it. Free forever, with no transaction fees.</p>
      <Button href="/signup" fullWidth size="lg" className="mt-6">
        Get started free
      </Button>
      <div className="mt-8 flex flex-col gap-5">
        {FREE_GROUPS.map((g) => {
          const keys = FREE_FOREVER.filter(g.match);
          if (!keys.length) return null;
          return (
            <div key={g.title}>
              <h3 className="text-meta-strong text-fg-muted">{g.title}</h3>
              <ul className="mt-1">
                {keys.map((k) => (
                  <FeatureLine key={k} k={k} />
                ))}
              </ul>
            </div>
          );
        })}
        <div>
          <h3 className="text-meta-strong text-fg-muted">Always</h3>
          <ul className="mt-1">
            <li className="flex gap-2.5 py-1.5 text-meta text-fg">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              No-download join at the counter
            </li>
            <li className="flex gap-2.5 py-1.5 text-meta text-fg">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0" strokeWidth={2} />
              No transaction fees, no contract
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function PaidCard({ id, available }: { id: "plus" | "pro"; available: boolean }) {
  const plan = PLANS[id];
  const keys = planFeatures(id);
  return (
    <div className="flex flex-col rounded-sheet border border-line bg-bg p-6 md:p-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-headline text-fg">{plan.name}</h2>
        {available ? null : <ComingSoonBadge />}
      </div>
      <p className="mt-5 flex items-baseline gap-2">
        <span className={cn("display text-mkt-lg tabular-nums", available ? "text-fg" : "text-fg-subtle")}>{price(id)}</span>
        <span className="text-body text-fg-muted">/month{available ? "" : ", planned"}</span>
      </p>
      <p className="text-meta text-fg-muted">or {formatMoney(plan.annualPriceCents).replace(".00", "")} a year</p>
      <p className="mt-3 text-body text-fg">{plan.blurb}</p>
      <p className="mt-1 text-meta text-fg-muted">Best for {plan.bestFor.join(", ").toLowerCase()}</p>
      {available ? (
        <Button href="/signup" fullWidth size="lg" className="mt-6">
          {`Start ${plan.name}`}
        </Button>
      ) : (
        <Button variant="secondary" fullWidth size="lg" href="/signup" className="mt-6">
          Start free, get notified
        </Button>
      )}
      <div className="mt-8">
        <h3 className="text-meta-strong text-fg-muted">{id === "plus" ? "Everything in Free, plus" : "Everything in Plus, plus"}</h3>
        <ul className="mt-1">
          {keys.map((k) => (
            <FeatureLine key={k} k={k} muted={!available} />
          ))}
          {plan.smsPerMonth ? (
            <li className="flex gap-2.5 py-1.5 text-meta">
              <Check aria-hidden className={cn("mt-0.5 size-4 shrink-0", available ? "text-fg" : "text-fg-subtle")} strokeWidth={2} />
              <span className={available ? "text-fg" : "text-fg-muted"}>{plan.smsPerMonth.toLocaleString("en-CA")} texts a month included</span>
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}

function Cell({ on, soon }: { on: boolean; soon?: boolean }) {
  return (
    <td className="px-3 py-3 text-center">
      {on ? <Check aria-label={soon ? "Included, coming soon" : "Included"} className={cn("mx-auto size-4", soon ? "text-fg-subtle" : "text-fg")} strokeWidth={2.25} /> : <Minus aria-label="Not included" className="mx-auto size-4 text-line-strong/50" strokeWidth={1.75} />}
    </td>
  );
}

function CompareTable({ available }: { available: Record<PlanId, boolean> }) {
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
                <span className="block font-normal text-fg-muted">{p === "free" ? "$0" : `${price(p)}/mo`}{p !== "free" && !available[p] ? " · soon" : ""}</span>
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

export default async function PricingPage() {
  const { available, progress } = await publicPlans();
  const feePct = (PLATFORM_PAYMENT_FEE_BPS / 100).toFixed(2).replace(/0$/, "");
  return (
    <>
      <section className="mx-auto max-w-[1200px] px-4 pt-14 pb-12 md:px-8 md:pt-24 md:pb-16">
        <p className="text-meta-strong text-fg-muted">Pricing</p>
        <h1 className="display mt-5 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">free forever. no transaction fees. unlimited locations.</h1>
        <p className="mt-6 max-w-2xl text-[18px] leading-[1.55] text-fg-muted">Your loyalty program and its reports cost nothing, for every shop. Plus and Pro add marketing, automations, payments and repair tools. They&apos;re coming soon, and only if you want them.</p>
      </section>
      <section className="pb-16 md:pb-24">
        <div className="mx-auto grid max-w-[1200px] gap-4 px-4 md:px-8 lg:grid-cols-3">
          <FreeCard />
          <PaidCard id="plus" available={available.plus} />
          <PaidCard id="pro" available={available.pro} />
        </div>
        <div className="mx-auto mt-10 grid max-w-[1200px] gap-8 px-4 md:grid-cols-[1.2fr_1fr] md:px-8">
          <p className="display text-mkt-sm text-balance">{copy.soon.pricingPromise}</p>
          <div className="flex flex-col gap-5">
            <p className="text-body text-fg-muted">{copy.soon.pricingNote}</p>
            {progress ? <ProgressBar value={Math.min(progress.current, progress.target)} max={progress.target} label="Active shops on the network" valueText={`${progress.current} of ${progress.target} shops · ${progress.neighbourhoods} neighbourhoods`} /> : null}
            <p className="text-meta text-fg-muted">In-app payments (Plus and Pro): Stripe&apos;s standard fee plus {feePct}%. The Free plan has no payments and no fees.</p>
          </div>
        </div>
      </section>
      <RestaurantPricing />
      <MSection tone="subtle" className="md:py-24!">
        <h2 className="display text-mkt-md md:text-mkt-lg">compare plans.</h2>
        <div className="mt-8 rounded-sheet border border-line bg-bg px-5 pb-4 md:px-8">
          <CompareTable available={available} />
        </div>
      </MSection>
      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <h2 className="display text-mkt-md md:text-mkt-lg">pricing questions.</h2>
          <Faq
            items={[
              { q: "Do you take a cut of my sales?", a: "No. Zero transaction fees on Free. The only fee anywhere is on payments you take in the app on Plus or Pro. Restaurant plans take no commission on online orders; deposits, invoices and tiffin billing carry a 1% fee." },
              { q: "Will my loyalty program ever cost money?", a: "No. Points, visits and stamps, rewards, the welcome bonus, your customer list and reports stay free. They will never move to a paid plan." },
              { q: "When do Plus and Pro launch?", a: "Once enough shops are on the network, so every paid feature launches with customers already using the app. Start on Free and we'll tell you." },
              { q: "Can I cancel a paid plan later?", a: "Yes, anytime. You go back to Free and keep all your loyalty data." },
              { q: "Is the restaurant plan a different plan?", a: "It sits beside Free, Café & Retail and Service. Any restaurant plan includes everything in Café & Retail, so you never pay for both." },
              { q: "Is there a contract?", a: "No contract and no setup fee." },
            ]}
          />
        </div>
      </MSection>
    </>
  );
}
