import { Plus } from "lucide-react";
import type { Metadata } from "next";
import { FEES, PLANS, campaignsApi, foundingSoloConfig, isPlanAvailable, type PlanId, type billingApi } from "@ll/shared";
import { ArtTiles } from "@/components/marketing/HeroArt";
import { ChipLink } from "@/components/marketing/ChipLink";
import { CompetitorTableSolo } from "@/components/marketing/CompetitorTableSolo";
import { Faq } from "@/components/marketing/Faq";
import { ScrollTo } from "@/components/marketing/ScrollTo";
import { MSection } from "@/components/marketing/Section";
import { Button } from "@/components/ui/Button";
import { copy } from "@/copy/en-CA";
import { publicServerApi } from "@/lib/api/server";
import { fill, moneyShort } from "@/lib/marketing/text";
import { AnnualCard, CompareStrip, CompareTable, FreeCard, PLUS_TARGET, PaidCard, ServiceLine, SoloTable } from "./PlanCards";
import { TradeRows } from "./TradeRows";
import { RestaurantPricing } from "./RestaurantPricing";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description: `Free for one bookable calendar with deposits, and free forever for your loyalty program. ${PLANS.plus.name} at ${moneyShort(PLANS.plus.priceCents)} a month or ${moneyShort(PLANS.plus.annualPriceCents)} a year with your own website. Prices in CAD.`,
  alternates: { canonical: "/pricing" },
};

const P = copy.pricing;

/** Real plan availability + network count from GET /v1/public/plans; shared defaults when the API is down. */
async function publicPlans(): Promise<{ available: Record<PlanId, boolean>; activeShops: number | null }> {
  try {
    const r = await publicServerApi().public.plans();
    const available = { free: true, plus: false, pro: false } as Record<PlanId, boolean>;
    for (const p of r.items) available[p.id] = p.available;
    return { available, activeShops: r.network.activeMerchants };
  } catch {
    return { available: { free: true, plus: isPlanAvailable("plus", {}), pro: isPlanAvailable("pro", {}) }, activeShops: null };
  }
}

/** The founding solo price with the live spot count; the config alone (no count) when the API is down. Null when the offer is off. */
async function foundingSolo(): Promise<billingApi.FoundingSoloDto | null> {
  try {
    const f = await publicServerApi().public.foundingSolo();
    return f.enabled ? f : null;
  } catch {
    const cfg = foundingSoloConfig(process.env);
    return cfg.enabled ? { enabled: true, priceCents: cfg.priceCents, renewsAtCents: PLANS.plus.annualPriceCents, slots: cfg.slots, spotsLeft: cfg.slots, eligible: false, taken: false } : null;
  }
}

const pct = (bps: number) => `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%`;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function PricingPage({ searchParams }: Props) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]);
  const audience = one("for") === "restaurant" || one("for") === "bia" ? (one("for") as "restaurant" | "bia") : "shop";
  const compareOpen = one("compare") === "1";
  const [{ available, activeShops }, founding] = await Promise.all([publicPlans(), foundingSolo()]);
  const bia = campaignsApi.CAMPAIGN_PACKAGES;
  return (
    <>
      <section className="mx-auto grid max-w-300 items-center gap-10 px-4 pt-10 pb-10 md:grid-cols-[1.4fr_1fr] md:gap-14 md:px-8 md:pt-16 md:pb-14">
        <div>
          <p className="text-meta-strong text-primary-text">{P.eyebrow}</p>
          <h1 className="display mkt-rise mt-5 max-w-4xl text-mkt-lg text-balance md:text-mkt-xl">{P.title}</h1>
          <p className="[--i:1] mkt-rise mt-6 max-w-2xl text-[18px] leading-[1.55] text-muted-foreground">{P.sub}</p>
          <nav aria-label="Pricing for" className="mt-8 flex flex-wrap gap-2">
            {P.chips.map((c) => (
              <ChipLink key={c.id} href={c.href} current={audience === c.id}>
                {c.label}
              </ChipLink>
            ))}
          </nav>
          {audience !== "shop" ? <ScrollTo id={audience === "restaurant" ? "restaurants" : "bias"} /> : null}
        </div>
        <ArtTiles className="max-md:hidden" />
      </section>

      <section id="shops" className="scroll-mt-20 pb-12 md:pb-16">
        <p className="mx-auto mb-4 max-w-300 px-4 text-meta-strong text-muted-foreground md:px-8">{copy.soloPricing.pricesNote}</p>
        <div className="mx-auto grid max-w-300 items-stretch gap-4 px-4 md:px-8 lg:grid-cols-3">
          <FreeCard />
          <PaidCard id="plus" />
          <AnnualCard founding={founding} />
        </div>
        <div className="mx-auto mt-4 max-w-300 px-4 md:px-8">
          <ServiceLine />
        </div>
        <div className="mx-auto mt-10 max-w-300 px-4 md:px-8">
          <h2 className="display text-mkt-md">{copy.soloPricing.table.title}</h2>
          <div className="mt-4 rounded-card bg-card px-5 pb-2 shadow-card md:px-7">
            <SoloTable />
          </div>
        </div>
        <div className="mx-auto mt-12 max-w-300 px-4 md:px-8">
          <CompareStrip />
        </div>
        <p className="mx-auto mt-6 max-w-300 px-4 text-meta text-muted-foreground md:px-8">
          {fill(P.openNote, { target: String(PLUS_TARGET) })}{activeShops !== null ? ` ${activeShops} shops have joined so far.` : ""} Your loyalty program never moves to a paid plan.
        </p>
      </section>

      {/* The full comparison with the booking apps, moved here from the solo landing pages (their price block links to it). */}
      <CompetitorTableSolo c={{ ...copy.solo.compare, brand: "Local Loyalty" }} chairs id="booking-apps" />

      <TradeRows />

      <RestaurantPricing />

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

      <section id="compare" className="mx-auto max-w-300 scroll-mt-20 px-4 pb-16 md:px-8 md:pb-24">
        <details open={compareOpen} className="group rounded-card bg-card shadow-card" data-testid="compare">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-6 px-5 text-headline text-foreground focus-visible:focus-ring md:px-7 [&::-webkit-details-marker]:hidden">
            {P.compareSummary}
            <Plus aria-hidden className="size-5 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-open:rotate-45" strokeWidth={1.75} />
          </summary>
          <div className="border-t border-border px-5 pb-4 md:px-7">
            <CompareTable available={available} />
          </div>
        </details>
      </section>

      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="text-meta-strong text-primary-text">{P.faqEyebrow}</p>
            <h2 className="display mt-3 text-mkt-md md:text-mkt-lg">{P.faqTitle}</h2>
          </div>
          <Faq
            items={P.faq.map((f) => ({ q: f.q, a: fill(f.a, { cut: pct(FEES.depositInvoiceBps), target: PLUS_TARGET }) }))}
          />
        </div>
      </MSection>
    </>
  );
}
