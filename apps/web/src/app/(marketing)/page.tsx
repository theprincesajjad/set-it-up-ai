import { ArrowRight, CalendarCheck, Check, Landmark, Stamp, UtensilsCrossed } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { MapCategoryId } from "@ll/design-tokens";
import { BRAND, FEES } from "@ll/shared";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { Faq } from "@/components/marketing/Faq";
import { TradeMarquee } from "@/components/marketing/TradeMarquee";
import { ContactForm } from "@/components/marketing/ContactForm";
import { LiveProof } from "@/components/marketing/LiveProof";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { IPhone } from "@/components/marketing/device/IPhone";
import { CounterPhone, CounterTablet, MapPhone, PassPhone, PromoMock, TodayDesktop, TodayPhone } from "@/components/marketing/home/mocks";
import "@/components/marketing/home/home.css";
import { BentoCard, BentoGrid } from "@/components/primitives/bento-grid";
import { BlurFadeStatic } from "@/components/primitives/blur-fade-static";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { copy } from "@/copy/en-CA";
import { marketingPlans, planLine, planNote, planVars } from "@/lib/marketing/plan-copy";
import { fill } from "@/lib/marketing/text";
import { whatsappUrl } from "@/lib/marketing/whatsapp";

export const revalidate = 300;

const L = copy.landing;

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name}: ${L.meta.title}` },
  description: L.meta.description,
  alternates: { canonical: "/" },
};

/** Plan and fee fills for the home copy: names and prices from lib/marketing/plan-copy.ts (PLANS), the order fee from FEES. */
const VARS = { ...planVars(), orderFee: Number((FEES.orderBpsFree / 100).toFixed(2)) };
const f = (s: string) => fill(s, VARS);

/** Where-do-you-fit as a bento (wave Q): the art, the trade colour, the icon and the span of each door, in L.router.items order. */
const ROUTER: { art: MapCategoryId; trade?: string; Icon: typeof Stamp; span: string }[] = [
  { art: "coffee", trade: "cafe", Icon: Stamp, span: "md:col-span-2" },
  { art: "beauty", trade: "nails", Icon: CalendarCheck, span: "md:col-span-1" },
  { art: "eat", trade: "restaurant", Icon: UtensilsCrossed, span: "md:col-span-1" },
  { art: "all", Icon: Landmark, span: "md:col-span-2" },
];

function Primary({ href = "/signup", cta, children, className }: { href?: string; cta: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={className ? `hm-btn ${className}` : "hm-btn"} data-cta={cta}>
      {children}
      <ArrowRight aria-hidden strokeWidth={2.4} />
    </Link>
  );
}

/** Under the hero buttons: what it costs, in one glance (loyalty free, Pro's monthly price and its first-year price, the trial). */
function HeroPrice() {
  const pro = marketingPlans("shop").find((p) => p.key === "monthly")!;
  const P = L.hero.price;
  return (
    <p className="hm-trial" data-testid="hero-price">
      <b>{P.free}</b> {f(P.pro)}{" "}
      {pro.yearly?.was ? (
        <>
          <s>{pro.yearly.was}</s> <b>{pro.yearly.now}</b> {P.first}
        </>
      ) : (
        `${pro.yearly?.line ?? ""}.`
      )}{" "}
      {f(P.trial)}
    </p>
  );
}

/** A small sample inside the two wide bento cards: the stamp card and a street passport (decorative; the hero caption says sample data). */
function BentoDemo({ i }: { i: number }) {
  const B = L.hero.bento;
  if (i === 0)
    return (
      <div className="hm-bento-demo" aria-hidden>
        <b>{B.stamps}</b>
        <span className="hm-bento-stamps">
          {Array.from({ length: 10 }, (_, k) => (
            <i key={k} />
          ))}
        </span>
      </div>
    );
  if (i === 3)
    return (
      <div className="hm-bento-demo" aria-hidden>
        <b>{B.passport}</b>
        <span className="hm-bento-bar">
          <i />
        </span>
        <small>{B.shops}</small>
      </div>
    );
  return null;
}

/** One outcome row: the words on one side, the product on the other (sides alternate from md). */
function Outcome({ id, i, children }: { id: (typeof L.outcomes.rows)[number]["id"]; i: number; children: React.ReactNode }) {
  const r = L.outcomes.rows.find((x) => x.id === id)!;
  const points = r.id === "promos" ? [...r.points, planLine("promoAllowance")] : r.points;
  return (
    <BlurFadeStatic className={i % 2 ? "hm-row hm-row-flip" : "hm-row"} id={`outcome-${r.id}`}>
      <div className="hm-row-copy">
        <h3 className="hm-h3">{r.title}</h3>
        <p className="hm-body">{r.body}</p>
        <ul className="hm-checks">
          {points.map((p) => (
            <li key={p}>
              <Check aria-hidden strokeWidth={2.6} />
              {p}
            </li>
          ))}
        </ul>
      </div>
      <figure className="hm-row-art" role="img" aria-label={r.label}>
        {children}
        {r.floats.map((x, k) => (
          <span key={x.b} className={`hm-float glass-sheet ${k ? "hm-float-b" : "hm-float-a"}`} aria-hidden>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/icons3d/${x.icon}@2x.png`} alt="" width={32} height={32} loading="lazy" decoding="async" />
            <span>
              <b>{x.b}</b>
              <small>{x.s}</small>
            </span>
          </span>
        ))}
      </figure>
    </BlurFadeStatic>
  );
}

/**
 * The home page (landing v4, cut down in wave P so it reads like a product site, not a wall): the promise, the price and the product
 * (the Today screen and the customer's pass), live network counts, how it works beside the counter, three outcome rows with real-screen
 * mocks, where-do-you-fit, the three plans (lib/marketing/plan-copy.ts), the dated comparison, questions, a visit, and the closing ask;
 * on phones a sticky bar keeps the button in reach. Gone in wave P: the facts strip (it repeated the hero), the pass row (the hero shows
 * the pass) and the separate "why Pro" block (the Pro card says the same). Static (re-generated every 5 minutes for the live counts),
 * CSS-only motion, no client script of its own beyond the visit form and the questions.
 * Wave Q (kit): a stacked window and glass notes give the hero depth, a Marquee of trades sits under it, where-do-you-fit is a
 * BentoGrid, the questions are the kit Accordion, and sections below the fold rise in with BlurFadeStatic (CSS scroll timeline, no JS).
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  const plans = marketingPlans("shop");
  return (
    // data-solo-trade="home": the landing beacon's page marker (LandingMeasure below); "/" is counted for the admin funnel (wave N).
    <div className="hm" data-solo-trade="home">
      {/* 1. Hero */}
      <section className="hm-hero" aria-labelledby="hm-title">
        <div className="hm-wrap hm-hero-copy">
          <h1 className="hm-h1" id="hm-title">
            <span>{L.hero.title[0]}</span> <span>{L.hero.title[1]}</span>
          </h1>
          <p className="hm-lede">{L.hero.sub}</p>
          <div className="hm-ctas">
            <Primary cta="hero">{L.hero.primary}</Primary>
            <a className="hm-btn2" href="#how" data-cta="how">
              {L.hero.secondary}
            </a>
          </div>
          <HeroPrice />
          <ul className="hm-trust">
            {L.hero.trust.map((t) => (
              <li key={t}>
                <Check aria-hidden strokeWidth={2.6} />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="hm-wrap">
          <div className="hm-stage" role="img" aria-label={L.hero.stageLabel}>
            {/* Wave Q depth: a second window stacked behind the Today screen, and two glass notes floating over the edges (wide screens). */}
            <div className="hm-window-back" aria-hidden />
            <div className="hm-window">
              <TodayDesktop />
            </div>
            <IPhone className="hm-hero-phone" status="light">
              <PassPhone />
            </IPhone>
            {L.hero.floats.map((x, k) => (
              <span key={x.b} className={`hm-float glass-sheet hm-stage-float ${k ? "hm-stage-float-b" : "hm-stage-float-a"}`} aria-hidden>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/icons3d/${x.icon}@2x.png`} alt="" width={32} height={32} loading="lazy" decoding="async" />
                <span>
                  <b>{x.b}</b>
                  <small>{x.s}</small>
                </span>
              </span>
            ))}
          </div>
          <p className="hm-caption">{L.hero.caption}</p>
        </div>
      </section>

      {/* 2. The trades it is set up for, a slow row (kit Marquee, CSS only). */}
      <TradeMarquee />

      {/* 3. Live proof: real counts, hidden until the network passes 10 businesses. */}
      <LiveProof />

      {/* 4. How it works, beside the counter */}
      <section className="hm-sec hm-white" id="how" aria-labelledby="hm-how">
        <BlurFadeStatic className="hm-wrap hm-how">
          <div>
            <h2 className="hm-h2" id="hm-how">
              {L.how.title}
            </h2>
            <p className="hm-lede">{L.how.sub}</p>
            <ol className="hm-steps">
              {L.how.steps.map((s, i) => (
                <li key={s.t}>
                  <span className="hm-step-n">{i + 1}</span>
                  <div>
                    <h3>{s.t}</h3>
                    <p>{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <figure className="hm-how-art" role="img" aria-label={L.how.label}>
            <div className="hm-tablet">
              <div className="hm-tablet-screen">
                <CounterTablet />
              </div>
            </div>
            <IPhone className="hm-how-phone">
              <CounterPhone />
            </IPhone>
          </figure>
        </BlurFadeStatic>
      </section>

      {/* 5. Outcomes, each with the real screen */}
      <section className="hm-sec" id="product" aria-labelledby="hm-product">
        <div className="hm-wrap">
          <div className="hm-head hm-center">
            <h2 className="hm-h2" id="hm-product">
              {L.outcomes.title}
            </h2>
            <p className="hm-lede">{L.outcomes.sub}</p>
          </div>
          <div className="hm-rows">
            {/* The pass row is gone (wave P): the hero already shows the card on a phone, and step 2 of "how" says Wallet. */}
            <Outcome id="week" i={0}>
              <IPhone className="hm-row-phone">
                <TodayPhone />
              </IPhone>
            </Outcome>
            <Outcome id="promos" i={1}>
              <PromoMock />
            </Outcome>
            <Outcome id="map" i={2}>
              <IPhone className="hm-row-phone">
                <MapPhone />
              </IPhone>
            </Outcome>
          </div>
          <div className="hm-ctarow">
            <Primary cta="outcomes">{L.outcomes.cta}</Primary>
            <a className="hm-link" href="#pricing" data-cta="seepricing">
              {L.outcomes.pricing}
            </a>
          </div>
        </div>
      </section>

      {/* 6. Where do you fit? */}
      <section className="hm-sec hm-white" aria-label={L.router.label}>
        <div className="hm-wrap">
          <div className="hm-head">
            <h2 className="hm-h2">{L.router.title}</h2>
            <p className="hm-lede">{L.router.sub}</p>
          </div>
          <BlurFadeStatic>
            <BentoGrid className="hm-bento auto-rows-auto gap-3 md:auto-rows-[16.5rem] md:gap-4">
              {L.router.items.map((d, i) => {
                const r = ROUTER[i]!;
                return (
                  <BentoCard
                    key={d.href}
                    data-trade={r.trade}
                    className={`col-span-3 bg-background ${r.span}`}
                    eyebrow={d.eyebrow}
                    name={d.title}
                    description={d.body}
                    Icon={r.Icon}
                    href={d.href}
                    cta={d.cta}
                    background={
                      <>
                        <BentoDemo i={i} />
                        <CategoryIcon category={r.art} size={i === 0 || i === 3 ? 168 : 120} className="hm-bento-art" />
                      </>
                    }
                  />
                );
              })}
            </BentoGrid>
          </BlurFadeStatic>
          <nav aria-label={copy.solo.chipsLabel} className="hm-chips">
            <span>{copy.solo.chipsLabel}</span>
            {copy.solo.chips.map((c) => (
              <Link key={c.href} href={c.href} prefetch={false}>
                {c.label}
              </Link>
            ))}
          </nav>
        </div>
      </section>

      {/* 8. Pricing: every word from lib/marketing/plan-copy.ts, every number from PLANS */}
      <section className="hm-sec hm-white" id="pricing" aria-labelledby="hm-pricing">
        <div className="hm-wrap">
          <div className="hm-head hm-center">
            <h2 className="hm-h2" id="hm-pricing">
              {L.pricing.title}
            </h2>
            <p className="hm-lede">{f(L.pricing.sub)}</p>
          </div>
          <BlurFadeStatic className="hm-plans">
            {plans.map((p) => (
              <div key={p.key} data-plan={p.key} className={p.key === "monthly" ? "hm-plan hm-plan-pro" : "hm-plan"}>
                <div className="hm-plan-h">
                  <span className="hm-plan-name">{p.name}</span>
                  {p.badge ? <span className="hm-badge">{p.badge}</span> : null}
                </div>
                <span className="hm-plan-price">
                  {p.price}
                  {p.per ? <small>{p.per}</small> : null}
                </span>
                {p.yearly ? (
                  <span className="hm-plan-yearly" data-plan={p.key === "monthly" ? "yearly" : undefined}>
                    {p.yearly.was ? (
                      <>
                        {p.yearly.or} <s>{p.yearly.was}</s> <b>{p.yearly.now}</b> {p.yearly.label}
                      </>
                    ) : (
                      p.yearly.line
                    )}
                  </span>
                ) : null}
                <span className="hm-plan-tag">{p.tagline}</span>
                <ul>
                  {p.features.map((x) => (
                    <li key={x}>
                      <Check aria-hidden strokeWidth={2.6} />
                      {x}
                    </li>
                  ))}
                </ul>
                <Primary cta="pricing" className={p.key === "monthly" ? "hm-btn-inv" : undefined}>
                  {p.cta}
                </Primary>
              </div>
            ))}
          </BlurFadeStatic>
          <p className="hm-plans-note">
            <span>{planNote("shop")}</span>
            <Link href="/pricing" prefetch={false}>
              {L.pricing.all}
            </Link>
            <span>
              {L.pricing.restaurants}{" "}
              <Link href="/for-restaurants" prefetch={false}>
                {L.pricing.restaurantsLink}
              </Link>
            </span>
          </p>
        </div>
      </section>

      {/* 9. How we compare: named, dated, sourced */}
      <CompetitorTable />

      {/* 10. Questions */}
      <section className="hm-sec hm-white" aria-labelledby="hm-faq">
        <div className="hm-wrap hm-faq">
          <h2 className="hm-h2" id="hm-faq">
            {L.faqTitle}
          </h2>
          <BlurFadeStatic>
            <Faq items={L.faq.map((q) => ({ q: q.q, a: f(q.a) }))} />
          </BlurFadeStatic>
        </div>
      </section>

      {/* 11. A hand getting set up */}
      <section className="hm-sec" id="book" aria-labelledby="hm-book">
        <BlurFadeStatic className="hm-wrap hm-book">
          <div>
            <h2 className="hm-h2" id="hm-book">
              {L.book.title}
            </h2>
            <p className="hm-lede">{L.book.sub}</p>
            {waUrl ? (
              <a className="hm-btn2" href={waUrl}>
                {L.book.whatsapp}
              </a>
            ) : null}
          </div>
          <div className="hm-book-form">
            <ContactForm kind="visit" />
          </div>
        </BlurFadeStatic>
      </section>

      {/* 12. The closing ask */}
      <section className="hm-final" aria-labelledby="hm-final">
        <div className="hm-wrap hm-final-in">
          <div>
            <h2 className="hm-h2" id="hm-final">
              {L.final.title}
            </h2>
            <p>{L.final.sub}</p>
          </div>
          <div className="hm-ctas">
            <Primary cta="final" className="hm-btn-inv">
              {L.final.cta}
            </Primary>
          </div>
        </div>
      </section>

      {/* Phones: the button in reach (hidden over the hero and the closing band where the browser has scroll-driven animation). */}
      <div className="hm-sticky">
        <Primary cta="sticky">{L.sticky}</Primary>
      </div>
      <LandingMeasure path="/" />
    </div>
  );
}
