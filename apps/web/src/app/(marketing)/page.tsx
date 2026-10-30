import { ArrowRight, Check, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { MapCategoryId } from "@ll/design-tokens";
import { BRAND, FEES } from "@ll/shared";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { LiveProof } from "@/components/marketing/LiveProof";
import { IPhone } from "@/components/marketing/device/IPhone";
import { CounterPhone, CounterTablet, MapPhone, PassPhone, PromoMock, TodayDesktop, TodayPhone } from "@/components/marketing/home/mocks";
import "@/components/marketing/home/home.css";
import { CategoryIcon } from "@/components/ui/CategoryIcon";
import { copy } from "@/copy/en-CA";
import { marketingPlans, planLine, planNote, planVars, proHighlights } from "@/lib/marketing/plan-copy";
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

const ROUTER_ART: MapCategoryId[] = ["coffee", "beauty", "eat", "all"];
/** The Pro section's pictures, one per money feature (public/icons3d). */
const PRO_ART: Record<string, string> = { winback: "bell", reviews: "top", promos: "megaphone", report: "price_tag" };

function Primary({ href = "/signup", cta, children, className }: { href?: string; cta: string; children: React.ReactNode; className?: string }) {
  return (
    <Link href={href} prefetch={false} className={className ? `hm-btn ${className}` : "hm-btn"} data-cta={cta}>
      {children}
      <ArrowRight aria-hidden strokeWidth={2.4} />
    </Link>
  );
}

/** One outcome row: the words on one side, the product on the other (sides alternate from md). */
function Outcome({ i, children }: { i: number; children: React.ReactNode }) {
  const r = L.outcomes.rows[i]!;
  const points = r.id === "promos" ? [...r.points, planLine("promoAllowance")] : r.points;
  return (
    <div className={i % 2 ? "hm-row hm-row-flip" : "hm-row"} id={`outcome-${r.id}`}>
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
        {r.id === "promos" ? (
          <div className="hm-ctas hm-row-cta">
            <Primary cta="promos">{L.outcomes.cta}</Primary>
          </div>
        ) : null}
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
    </div>
  );
}

/**
 * The home page, landing v4 (scratchpad diagnosis: "Turn first visits into regulars"): the promise and the product (the Clear Today screen
 * and the customer's pass on an iPhone), four facts with a button, live network counts, how it works beside the counter, four outcome
 * rows with real-screen mocks, where-do-you-fit, why Pro (the money features, with the trial as the ask), the three plans (lib/marketing/plan-copy.ts), the dated comparison, questions, a visit,
 * and the closing ask; on phones a sticky bar keeps the button in reach. Static (re-generated every 5 minutes for the live counts),
 * CSS-only motion, no client script of its own beyond the visit form.
 */
export default function Home() {
  const waUrl = whatsappUrl(L.book.whatsappText);
  const plans = marketingPlans("shop");
  const pro = proHighlights("shop");
  return (
    <div className="hm">
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
          <p className="hm-trial">{planLine("priceLine")}</p>
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
            <div className="hm-window">
              <TodayDesktop />
            </div>
            <IPhone className="hm-hero-phone" status="light">
              <PassPhone />
            </IPhone>
          </div>
          <p className="hm-caption">{L.hero.caption}</p>
        </div>
      </section>

      {/* 2. Facts and the first ask */}
      <section className="hm-facts" aria-label={L.facts.label}>
        <div className="hm-wrap hm-facts-in">
          <ul>
            {L.facts.items.map((x) => (
              <li key={x.line}>
                <b>{f(x.value)}</b>
                <span>{x.line}</span>
              </li>
            ))}
          </ul>
          <Primary cta="afterhero">{L.facts.cta}</Primary>
        </div>
      </section>

      {/* 3. Live proof: real counts, hidden until the network passes 10 businesses. */}
      <LiveProof />

      {/* 4. How it works, beside the counter */}
      <section className="hm-sec hm-white" id="how" aria-labelledby="hm-how">
        <div className="hm-wrap hm-how">
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
        </div>
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
            <Outcome i={0}>
              <IPhone className="hm-row-phone">
                <TodayPhone />
              </IPhone>
            </Outcome>
            <Outcome i={1}>
              <IPhone className="hm-row-phone" status="light">
                <PassPhone />
              </IPhone>
            </Outcome>
            <Outcome i={2}>
              <PromoMock />
            </Outcome>
            <Outcome i={3}>
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
          <ul className="hm-doors">
            {L.router.items.map((d, i) => (
              <li key={d.href}>
                <Link href={d.href} prefetch={false} className="hm-door">
                  <CategoryIcon category={ROUTER_ART[i]} size={56} />
                  <span className="hm-door-k">{d.eyebrow}</span>
                  <span className="hm-door-t">{d.title}</span>
                  <span className="hm-door-b">{d.body}</span>
                  <span className="hm-door-cta">
                    {d.cta}
                    <ArrowRight aria-hidden strokeWidth={2.2} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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

      {/* 7. Why Pro: the money features (lib/marketing/plan-copy.ts), illustrative samples, and the trial as the ask before the prices */}
      <section className="hm-sec" id="pro" aria-labelledby="hm-pro">
        <div className="hm-wrap">
          <div className="hm-head">
            <h2 className="hm-h2" id="hm-pro">
              {pro.title}
            </h2>
            <p className="hm-lede">{pro.sub}</p>
          </div>
          <ul className="hm-pro">
            {pro.items.map((x) => (
              <li key={x.id} className="hm-pro-card" data-pro={x.id}>
                <div className="hm-pro-demo" aria-hidden>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/icons3d/${PRO_ART[x.id]}@2x.png`} alt="" width={30} height={30} loading="lazy" decoding="async" />
                  <span>
                    <b>{x.sample}</b>
                    <small>{x.sampleLine}</small>
                  </span>
                </div>
                <h3>{x.title}</h3>
                <p>{x.body}</p>
              </li>
            ))}
          </ul>
          <p className="hm-pro-note">{pro.caption}</p>
          <div className="hm-ctarow hm-ctarow-start">
            <Primary cta="pro">{pro.trialCta}</Primary>
            <a className="hm-link" href="#pricing" data-cta="seepricing">
              {L.outcomes.pricing}
            </a>
          </div>
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
          <div className="hm-plans">
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
          </div>
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
          <div>
            {L.faq.map((q) => (
              <details key={q.q}>
                <summary>
                  {q.q}
                  <Plus aria-hidden strokeWidth={2} />
                </summary>
                <p>{f(q.a)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 11. A hand getting set up */}
      <section className="hm-sec" id="book" aria-labelledby="hm-book">
        <div className="hm-wrap hm-book">
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
        </div>
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
            <a className="hm-btn2 hm-btn2-inv" href="#pricing" data-cta="seepricing">
              {L.final.pricing}
            </a>
          </div>
        </div>
      </section>

      {/* Phones: the button in reach (hidden over the hero and the closing band where the browser has scroll-driven animation). */}
      <div className="hm-sticky">
        <Primary cta="sticky">{L.sticky}</Primary>
      </div>
    </div>
  );
}
