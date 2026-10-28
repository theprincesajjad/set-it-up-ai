import type { Metadata } from "next";
import { categoryLabels, type MapCategoryId } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";
import { AudienceRouter } from "@/components/marketing/AudienceRouter";
import { BiaBand } from "@/components/marketing/BiaBand";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { LiveProof } from "@/components/marketing/LiveProof";
import { JoinScreen, MapScreen, PhoneFrame, ToastMock, WalletScreen } from "@/components/marketing/Mocks";
import { RestaurantBand } from "@/components/marketing/RestaurantBand";
import { MHeading, MSection } from "@/components/marketing/Section";
import { TradeStories } from "@/components/marketing/TradeStories";
import { VerticalTemplates } from "@/components/marketing/VerticalTemplates";
import { Button } from "@/components/ui/Button";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { copy } from "@/copy/en-CA";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: free loyalty for independent shops` },
  description: "Free forever, no fee on loyalty. Unlimited locations. A loyalty program for your shop, shared with every shop on your block. Sign up and give your first stamp in about 5 minutes.",
  alternates: { canonical: "/" },
};

const L = copy.landing;

const NETWORK_OBJECTS: MapCategoryId[] = ["coffee", "bakery", "eat", "shops", "beauty", "repair"];

/**
 * Landing, in the order of docs/research/landing-and-network.md §4.2: hero, who-are-you router, live proof, how it works,
 * network, kind of shop, restaurant band, named comparison, BIA band, FAQ, book a visit. One form, one conversion goal.
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  return (
    <>
      {/* 1. Hero: editorial headline left, the real product right. */}
      <section className="overflow-hidden">
        <div className="mx-auto grid max-w-[1200px] items-center gap-12 px-4 pt-14 pb-14 md:grid-cols-[1.05fr_1fr] md:gap-14 md:px-8 md:pt-24 md:pb-20">
          <div>
            <p className="text-meta-strong text-muted-foreground">{L.heroEyebrow}</p>
            <h1 className="display mt-5 text-mkt-lg text-balance md:text-mkt-xl">{L.heroTitle}</h1>
            <p className="mt-6 max-w-[34rem] text-[18px] leading-[1.55] text-muted-foreground">{L.heroSub}</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Button size="lg" href="/signup">
                Get started free
              </Button>
              <Button size="lg" variant="secondary" href="#book" className="rounded-full!">
                Prefer a hand? Book a visit
              </Button>
            </div>
            <p className="mt-5 text-meta text-muted-foreground">{L.heroTrust}</p>
          </div>
          <div className="relative mx-auto flex w-full max-w-[540px] justify-center pb-4">
            <PhoneFrame tone="map" height={520} className="relative z-[1]">
              <MapScreen />
              {/* Docked inside the phone above the rail, where the app shows it (polish-audit K4). */}
              <ToastMock className="absolute start-1/2 bottom-[104px] z-[6] -translate-x-1/2 whitespace-nowrap">Added 1 stamp. Sam now has 8.</ToastMock>
            </PhoneFrame>
            <PhoneFrame height={520} className="-ms-14 mt-14 hidden sm:block">
              <WalletScreen />
            </PhoneFrame>
          </div>
        </div>
      </section>

      {/* 2. Who are you? */}
      <AudienceRouter />

      {/* 3. Live proof: real counts, hidden until the network passes 10 shops. */}
      <LiveProof />

      {/* 4. How it works, with times. */}
      <MSection id="how">
        <div className="grid items-center gap-14 md:grid-cols-[1fr_1fr]">
          <div>
            <MHeading eyebrow={L.how.eyebrow} title={L.how.title} className="mb-10!" />
            <ol className="flex flex-col divide-y divide-border border-y border-border">
              {L.how.steps.map((s, i) => (
                <li key={s.t} className="grid grid-cols-[40px_1fr] gap-2 py-6">
                  <span className="display text-title tabular-nums text-muted-foreground">{i + 1}</span>
                  <div>
                    <h3 className="text-headline text-foreground">{s.t}</h3>
                    <p className="mt-1.5 text-body text-muted-foreground">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-center">
            <PhoneFrame height={480}>
              <JoinScreen />
            </PhoneFrame>
          </div>
        </div>
      </MSection>

      {/* 5. The network: one image, three lines. */}
      <MSection tone="subtle">
        <div className="grid items-center gap-14 md:grid-cols-2">
          {/* The category objects are the only illustration: every kind of shop, one card. */}
          <ul aria-label="Kinds of shop on the card" className="order-2 grid grid-cols-3 gap-3 md:order-1">
            {NETWORK_OBJECTS.map((c) => (
              <li key={c} className="flex flex-col items-center gap-2 rounded-card border border-border bg-background px-2 py-5">
                <CategoryIcon category={c} size={56} />
                <span className="display text-meta lowercase text-foreground">{categoryLabels[c]}</span>
              </li>
            ))}
          </ul>
          <div className="order-1 md:order-2">
            <MHeading eyebrow={L.network.eyebrow} title={L.network.title} sub={L.network.sub} className="mb-8!" />
            <ul className="flex flex-col divide-y divide-border border-y border-border text-body text-foreground">
              {L.network.points.map((t) => (
                <li key={t} className="py-4">
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </MSection>

      {/* 6. Verticals, with a restaurants chip that leaves for the restaurant page. */}
      <MSection id="verticals">
        <MHeading eyebrow={L.verticals.eyebrow} title={L.verticals.title} sub={L.verticals.sub} />
        <VerticalTemplates />
      </MSection>

      <TradeStories />

      {/* 7. Restaurant band: the paying wedge. */}
      <RestaurantBand />

      {/* 8. Free means free: named competitors with dates and sources. */}
      <CompetitorTable />

      {/* Testimonials: omitted until a pilot shop gives a real quote (never fake quotes or logos). */}

      {/* 9. BIA band: one metric, labelled sample data. */}
      <BiaBand />

      {/* 10. FAQ */}
      <MSection>
        <div className="grid gap-12 md:grid-cols-[1fr_1.5fr]">
          <MHeading eyebrow={L.faqEyebrow} title={L.faqTitle} className="mb-0!" />
          <Faq items={[...L.faq]} />
        </div>
      </MSection>

      {/* 11. Book a visit: the single conversion goal. */}
      <MSection tone="subtle" id="book">
        <div className="grid gap-12 md:grid-cols-2">
          <div>
            <MHeading eyebrow={L.book.eyebrow} title={L.book.title} sub={L.book.sub} className="mb-8!" />
            {waUrl ? (
              <Button variant="secondary" size="lg" href={waUrl} className="rounded-full!">
                {L.book.whatsapp}
              </Button>
            ) : null}
          </div>
          <div className="rounded-sheet border border-border bg-background p-6 md:p-8">
            <ContactForm kind="visit" />
          </div>
        </div>
      </MSection>
    </>
  );
}
