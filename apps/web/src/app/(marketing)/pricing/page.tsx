import { ArrowRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import { FEES, PLANS, RESTAURANT_PLANS, PLAN_IDS, TRIAL_DAYS, campaignsApi, firstYearPriceConfig, firstYearPriceShown, isPlanAvailable, type PlanId, type billingApi } from "@ll/shared";
import { ChipLink } from "@/components/marketing/ChipLink";
import { CompetitorTableSolo } from "@/components/marketing/CompetitorTableSolo";
import { Faq } from "@/components/marketing/Faq";
import { ScrollTo } from "@/components/marketing/ScrollTo";
import { MSection } from "@/components/marketing/Section";
import { BlurFadeStatic } from "@/components/primitives/blur-fade-static";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { fill, moneyShort } from "@/lib/marketing/text";
import { planNote } from "@/lib/marketing/plan-copy";
import { CompareTable, FreeCard, PLUS_TARGET, PaidCard, ServiceLine, SoloTable, pv } from "./PlanCards";
import { TradeRows } from "./TradeRows";
import { RestaurantPricing } from "./RestaurantPricing";
import { preloadInter } from "@/lib/fonts/inter";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free for one bookable calendar with deposits, and free forever for your loyalty program. ${PLANS.plus.name} at ${moneyShort(PLANS.plus.priceCents)} a month for one person, ${PLANS.studio.name} at ${moneyShort(PLANS.studio.priceCents)} for the whole shop, and ${TRIAL_DAYS} days of ${PLANS.plus.name} free. Prices in CAD.`,
  alternates: { canonical: "/pricing" },
};

const P = copy.pricing;

/** Real plan availability + network count from GET /v1/public/plans; shared defaults when the API is down. */
async function publicPlans(): Promise<{ available: Record<PlanId, boolean>; activeShops: number | null }> {
  try {
    const r = await publicServerApi().public.plans();
    const available = Object.fromEntries(PLAN_IDS.map((id) => [id, id === "free"])) as Record<PlanId, boolean>;
    for (const p of r.items) available[p.id] = p.available;
    return { available, activeShops: r.network.activeMerchants };
  } catch {
    return { available: Object.fromEntries(PLAN_IDS.map((id) => [id, isPlanAvailable(id, {})])) as Record<PlanId, boolean>, activeShops: null };
  }
}

/** The first-year price of annual Pro (struck-through list price); the config alone when the API is down. Null when it is not on offer. */
async function firstYearPrice(): Promise<billingApi.FirstYearPriceDto | null> {
  try {
    const f = await publicServerApi().public.firstYearPrice();
    return f.shown ? f : null;
  } catch {
    const cfg = firstYearPriceConfig(process.env);
    return firstYearPriceShown(cfg, cfg.slots) ? { shown: true, priceCents: cfg.priceCents, listPriceCents: PLANS.plus.annualPriceCents, eligible: false, taken: false } : null;
  }
}

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

const AUDIENCE_FROM = { shop: moneyShort(PLANS.plus.priceCents), restaurant: moneyShort(RESTAURANT_PLANS.starter.priceCents), bia: moneyShort(Math.min(...Object.values(campaignsApi.CAMPAIGN_PACKAGES).map((b) => b.priceCents))) };

/**
 * Wave P: /pricing shows one audience at a time (the chips at the top pick it: ?for=shop, the default, restaurant or bia), so a shop owner
 * is not scrolling past restaurant calculators and BIA packages. The other two audiences are a card each, one tap away.
 */
function OtherAudiences({ audience }: { audience: "shop" | "restaurant" | "bia" }) {
  const others = P.others.filter((o) => o.id !== audience);
  return (
    <section aria-label={P.othersLabel} className="mx-auto max-w-300 px-4 pb-12 md:px-8 md:pb-16">
      <ul className="grid gap-4 md:grid-cols-2">
        {others.map((o) => (
          <li key={o.id}>
            <a href={o.href} className="flex h-full min-h-28 flex-col gap-1 rounded-card bg-card p-6 shadow-card transition-colors hover:bg-muted focus-visible:focus-ring" data-audience={o.id}>
              <span className="text-meta-strong text-muted-foreground">{o.eyebrow}</span>
              <span className="text-headline text-foreground">{fill(o.title, { from: AUDIENCE_FROM[o.id] })}</span>
              <span className="text-body text-muted-foreground">{o.body}</span>
              <span className="mt-2 inline-flex items-center gap-1 text-body-strong text-foreground">
                {o.cta}
                <ArrowRight aria-hidden className="size-4 rtl:-scale-x-100" />
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PricingPage({ searchParams }: Props) {
  preloadInter();
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const audience = one("for") === "restaurant" || one("for") === "bia" ? (one("for") as "restaurant" | "bia") : "shop";
  const compareOpen = one("compare") === "1";
  const [{ available, activeShops }, firstYear] = await Promise.all([publicPlans(), firstYearPrice()]);
  const bia = campaignsApi.CAMPAIGN_PACKAGES;
  return (
    <>
      {/* Wave Q: a centred head (Stripe/Linear pricing pages): the promise, one line, and the audience chips. The decorative tile art is gone, and the headline paints with the first frame (no fade: it is the LCP). */}
      <section className="mx-auto max-w-300 px-4 pt-10 pb-8 text-center md:px-8 md:pt-16 md:pb-12">
        <div className="flex flex-col items-center">
          <p className="text-meta-strong text-primary-text">{P.eyebrow}</p>
          <h1 className="display mt-4 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">{P.title}</h1>
          <p className="mt-5 max-w-2xl text-[18px] leading-[1.55] text-pretty text-muted-foreground">{P.sub}</p>
          <nav aria-label="Pricing for" className="mt-7 flex flex-wrap justify-center gap-2">
            {P.chips.map((c) => (
              <ChipLink key={c.id} href={c.href} current={audience === c.id}>
                {c.label}
              </ChipLink>
            ))}
          </nav>
          {audience !== "shop" ? <ScrollTo id={audience === "restaurant" ? "restaurants" : "bias"} /> : null}
        </div>
      </section>

      {audience === "shop" ? (
      <>
      <section id="shops" className="scroll-mt-20 pb-12 md:pb-16">
        <p className="mx-auto mb-4 max-w-300 px-4 text-center text-meta-strong text-muted-foreground md:px-8">{copy.proPricing.pricesNote}</p>
        <div className="mx-auto grid max-w-300 items-stretch gap-4 px-4 md:px-8 lg:grid-cols-3 lg:gap-5 lg:py-4">
          <FreeCard />
          <PaidCard id="plus" firstYear={firstYear} />
          <PaidCard id="studio" firstYear={firstYear} />
        </div>
        <p className="mx-auto mt-4 max-w-300 px-4 text-meta text-muted-foreground md:px-8">{planNote("solo")}</p>
        <div className="mx-auto mt-4 max-w-300 px-4 md:px-8">
          <ServiceLine />
        </div>
        {/* Wave P: the plan table folds away under the cards (the cards already list what matters), and the four-card booking-app
            strip that sat here is gone: the dated table below (#booking-apps) says the same with sources. */}
        <div className="mx-auto mt-8 max-w-300 px-4 md:px-8">
          <details id="compare" open={compareOpen} className="group scroll-mt-20 rounded-card bg-card shadow-card" data-testid="compare">
            <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 px-5 text-headline text-foreground focus-visible:focus-ring md:px-7 [&::-webkit-details-marker]:hidden">
              {P.planTableSummary}
              <Plus aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-45" strokeWidth={1.75} />
            </summary>
            <div className="border-t border-border px-5 pb-2 md:px-7">
              <SoloTable />
            </div>
            {/* One place for both tables (wave P): the headline rows above, every feature below. */}
            <div className="border-t border-border px-5 pb-4 md:px-7">
              <h3 className="pt-5 text-headline text-foreground">{P.compareSummary}</h3>
              <CompareTable available={available} />
            </div>
          </details>
        </div>
        <p className="mx-auto mt-6 max-w-300 px-4 text-meta text-muted-foreground md:px-8">
          {fill(P.openNote, { target: String(PLUS_TARGET) })}{activeShops !== null ? ` ${activeShops} shops have joined so far.` : ""} Your loyalty program never moves to a paid plan.
        </p>
      </section>

      {/* The full comparison with the booking apps, moved here from the solo landing pages (their price block links to it). */}
      <BlurFadeStatic>
        <CompetitorTableSolo c={{ ...copy.solo.compare, brand: "Local Loyalty" }} chairs id="booking-apps" />
      </BlurFadeStatic>

      <BlurFadeStatic>
        <TradeRows />
      </BlurFadeStatic>
      </>
      ) : null}

      {audience === "restaurant" ? <RestaurantPricing /> : null}

      {audience === "bia" ? (
      <MSection id="bias" tone="sky" className="scroll-mt-20 md:py-20!">
        <div className="grid gap-10 md:grid-cols-[1fr_1.6fr]">
          <div>
            <h2 className="display text-mkt-md md:text-mkt-lg">{P.biaTitle}</h2>
            <p className="mt-4 text-body text-muted-foreground">{P.biaSub}</p>
            <Button href="/for-bias" variant="secondary" className="mt-6 rounded-full!">
              {P.biaCta}
            </Button>
          </div>
          <ul className="flex flex-col divide-y divide-border border-y border-border">
            {(Object.keys(bia) as (keyof typeof bia)[]).map((k) => (
              <li key={k} className="flex items-baseline justify-between gap-6 py-4">
                <div>
                  <p className="text-body-strong text-foreground">{bia[k].name.replace(": ", " · ")}</p>
                  <p className="mt-0.5 text-meta text-muted-foreground">
                    {bia[k].days} days · visit {bia[k].goalVisits} shops
                  </p>
                </div>
                <p className="shrink-0 text-body-strong tabular-nums text-foreground">{moneyShort(bia[k].priceCents)}</p>
              </li>
            ))}
          </ul>
        </div>
      </MSection>
      ) : null}

      <OtherAudiences audience={audience} />


      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="text-meta-strong text-primary-text">{P.faqEyebrow}</p>
            <h2 className="display mt-3 text-mkt-md md:text-mkt-lg">{P.faqTitle}</h2>
          </div>
          <BlurFadeStatic>
            <Faq items={copy.proPricing.faq.map((f) => ({ q: pv(f.q), a: fill(pv(f.a), { cut: pct(FEES.depositInvoiceBps), target: PLUS_TARGET }) }))} />
          </BlurFadeStatic>
        </div>
      </MSection>
    </>
  );
}
