import { Check, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { FEATURES, FEATURE_KEYS, FREE_FOREVER, PLANS, PLATFORM_PAYMENT_FEE_BPS, isPlanAvailable, type FeatureKey, type PlanId } from "@ll/shared";
import { Faq } from "@/components/marketing/Faq";
import { MSection } from "@/components/marketing/Section";
import { Badge, ComingSoonBadge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description: "Free forever. No transaction fees. Unlimited locations. Your loyalty program and its reports, free for every shop.",
  alternates: { canonical: "/pricing" },
};

const GROUPS: { title: string; match: (k: FeatureKey) => boolean }[] = [
  { title: "Loyalty", match: (k) => k.startsWith("loyalty.") || k === "discount_cards" },
  { title: "Promos", match: (k) => k.startsWith("promos.") || k.startsWith("marketing.") },
  { title: "Network", match: (k) => k.startsWith("network.") || k.startsWith("wallet.") },
  { title: "Customers", match: (k) => k.startsWith("customers.") || k.startsWith("reports.") },
  { title: "Integrations", match: (k) => k.startsWith("integrations.") },
  { title: "Team", match: (k) => k.startsWith("staff.") || k.startsWith("locations.") },
];

const PLUS_TARGET = Math.min(...FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === "plus").map((k) => FEATURES[k].unlockAtMerchants));

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

function PlanCard({ id, available }: { id: PlanId; available: boolean }) {
  const plan = PLANS[id];
  const free = id === "free";
  const features = free ? [] : FEATURE_KEYS.filter((k) => FEATURES[k].minPlan === id && FEATURES[k].phase === 2);
  return (
    <div className={cn("flex flex-col rounded-xl bg-surface p-6", free ? "border-2 border-brand shadow-md" : available ? "border border-border-strong" : "border border-dashed border-border-strong")}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-h2 text-fg">{plan.name}</h2>
        {free ? <Badge tone="brand">Every shop</Badge> : available ? null : <ComingSoonBadge />}
      </div>
      <p className="mt-4 flex items-baseline gap-2">
        <span className={cn("text-display tabular-nums", free || available ? "text-fg" : "text-fg-muted")}>{free ? "$0" : formatMoney(plan.priceCents).replace(".00", "")}</span>
        <span className="text-body text-fg-muted">{free ? "forever" : "/month"}</span>
      </p>
      {!free && !available ? <p className="text-caption text-fg-muted">Planned price</p> : null}
      <p className="mt-3 text-body text-fg">{plan.blurb}</p>
      <p className="mt-2 text-body-sm text-fg-muted">Best for: {plan.bestFor.join(", ")}</p>
      <div className="mt-5">
        {free ? (
          <Button href="/signup" fullWidth size="lg">
            Get started free
          </Button>
        ) : available ? (
          <Button href="/signup" fullWidth size="lg">
            {`Start ${plan.name}`}
          </Button>
        ) : (
          <Button variant="tonal" fullWidth size="lg" href="/signup">
            Start free, get notified
          </Button>
        )}
      </div>
      {free ? (
        <div className="mt-6 flex flex-col gap-5">
          {GROUPS.map((g) => {
            const keys = FREE_FOREVER.filter(g.match);
            if (!keys.length) return null;
            return (
              <div key={g.title}>
                <h3 className="text-overline uppercase text-fg-muted">{g.title}</h3>
                <ul className="mt-2 flex flex-col gap-2">
                  {keys.map((k) => (
                    <li key={k} className="flex gap-2 text-body-sm text-fg">
                      <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                      <span>
                        <span className="font-semibold">{FEATURES[k].name}.</span> {FEATURES[k].description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-6">
          <p className="text-body-sm font-semibold text-fg">{id === "pro" ? "Includes everything in Plus, plus:" : "Includes everything in Free, plus:"}</p>
          <ul className="mt-2 flex flex-col gap-2">
            {features.map((k) => (
              <li key={k} className="flex gap-2 text-body-sm text-fg">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                <span>
                  <span className="font-semibold">{FEATURES[k].name}.</span> {FEATURES[k].description}
                </span>
              </li>
            ))}
            <li className="flex gap-2 text-body-sm text-fg">
              <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              {plan.smsPerMonth.toLocaleString("en-CA")} texts a month included
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function PricingPage() {
  const { available, progress } = await publicPlans();
  const feePct = (PLATFORM_PAYMENT_FEE_BPS / 100).toFixed(2).replace(/0$/, "");
  return (
    <>
      <MSection className="!pb-8">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="font-display text-[36px] font-semibold leading-[42px] text-fg md:text-display">Free forever. No transaction fees. Unlimited locations.</h1>
          <p className="mt-4 text-body-lg text-fg-muted">Your loyalty program and its reports, free for every shop. Promos, marketing and POS tools come later on Plus and Pro, and only if you want them.</p>
        </div>
      </MSection>
      <section className="pb-12">
        <div className="mx-auto grid max-w-[1200px] gap-6 px-4 md:px-8 lg:grid-cols-3">
          <PlanCard id="free" available />
          <PlanCard id="plus" available={available.plus} />
          <PlanCard id="pro" available={available.pro} />
        </div>
        <div className="mx-auto mt-10 flex max-w-3xl flex-col gap-6 px-4 md:px-8">
          <p className="text-body text-fg-muted">{copy.soon.pricingNote}</p>
          {progress ? <ProgressBar value={Math.min(progress.current, progress.target)} max={progress.target} label="Active shops on the network" valueText={`${progress.current} of ${progress.target} shops · ${progress.neighbourhoods} neighbourhoods`} /> : null}
          <p className="text-body text-fg">
            <span className="font-semibold">Payments:</span> In-app payments (Plus and Pro): Stripe&apos;s standard fee plus {feePct}%. The Free plan has no payments and no fees.
          </p>
          <div className="flex items-start gap-3 rounded-lg bg-brand-subtle p-5 text-on-brand-subtle">
            <ShieldCheck aria-hidden className="mt-0.5 size-6 shrink-0" />
            <p className="text-body-strong">{copy.soon.pricingPromise}</p>
          </div>
        </div>
      </section>
      <MSection tone="subtle">
        <div className="mx-auto max-w-3xl">
          <h2 className="mb-6 text-h2 text-fg">Pricing questions</h2>
          <Faq
            items={[
              { q: "Do you take a cut of my sales?", a: "No. Zero transaction fees on Free." },
              { q: "Will loyalty ever cost money?", a: "No. Your loyalty program (points, stamps, visits, rewards, welcome bonus) and its reports are free forever and will never move to a paid plan." },
              { q: "What needs Plus?", a: "Promos and bonus-point days, VIP levels, birthday and referral rewards, discount cards, email and SMS campaigns, CSV import and export, POS auto-award, webhooks and order-ahead. Pro adds service tickets, quotes, deposits and invoices." },
              { q: "When do Plus and Pro launch?", a: "Once enough shops are on the network, so every paid feature launches with customers already using the app. Tap Notify me and we'll tell you." },
              { q: "Can I cancel a paid plan later?", a: "Yes, anytime. You go back to Free and keep all your loyalty data." },
              { q: "Is there a contract?", a: "No contract and no setup fee." },
            ]}
          />
        </div>
      </MSection>
    </>
  );
}
