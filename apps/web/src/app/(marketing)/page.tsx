import { ArrowDown, ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND, FEES } from "@ll/shared";
import { CompetitorTable } from "@/components/marketing/CompetitorTable";
import { ContactForm } from "@/components/marketing/ContactForm";
import { Faq } from "@/components/marketing/Faq";
import { LiveProof } from "@/components/marketing/LiveProof";
import { LivePhone, RISE_SCRIPT, RiseTitle, VIDEO_SCRIPT } from "@/components/marketing/landing/HeroLive";
import { PHOTOS, Photo, type PhotoSet } from "@/components/marketing/landing/Photo";
import { PASSES, StampAdded, WalletPass, WeeklyCard, WinBack } from "@/components/marketing/landing/Product";
import { TrySection } from "@/components/marketing/landing/TrySection";
import "@/components/marketing/landing/landing.css";
import { LandingMeasure } from "@/components/marketing/landing-ab/LandingMeasure";
import { QrCode } from "@/components/ui/QrCode";
import { copy } from "@/copy/en-CA";
import { Emph } from "@/lib/marketing/emphasis";
import { marketingFontVars } from "@/lib/marketing/fonts";
import { marketingPlans, planNote, planVars } from "@/lib/marketing/plan-copy";
import { marketingSerifVar, preloadSerif } from "@/lib/marketing/serif";
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

/** The sample bakery on the hero's phone and in how it works (sample shop data, like every name on the drawn product moments). */
const P = PASSES.bakery;

/**
 * Every sign-up ask on the page goes to /signup and carries its data-cta (the funnel counts them; e2e/marketing-bia.spec.ts allows 8 in
 * <main>). Black pill by default, white on the black bands, outlined as the quiet one. The arrow nudges on hover (landing.css).
 */
function Primary({ cta, children, tone = "black", xl = false }: { cta: string; children: React.ReactNode; tone?: "black" | "outline" | "white"; xl?: boolean }) {
  return (
    <Link href="/signup" prefetch={false} className={`lp-btn lp-btn-${tone}${xl ? " lp-btn-xl" : ""}`} data-cta={cta}>
      {children}
      <ArrowRight aria-hidden strokeWidth={2} />
    </Link>
  );
}

/** Wave X: the hero's reassurance line, its first part ("Free forever") the price in the first screen (data-testid hero-price). */
const reassure = L.reassure.split(" · ");

/** Wave W: the one reassurance line under every primary ask, in muted text. */
function Reassure() {
  return <p className="lp-reassure">{L.reassure}</p>;
}

/**
 * Phones: the dots under a sideways row (how it works, what you get, the shop tiles). Drawn on the server with the first one on;
 * SNAP_SCRIPT moves the mark as the row scrolls. Hidden where the row is a grid.
 */
function Dots({ n }: { n: number }) {
  return (
    <div className="lp-dots" data-snap-dots aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} data-on={i === 0 ? "" : undefined} />
      ))}
    </div>
  );
}

/** The shop tiles' photos, in copy order (public/marketing/photos/CREDITS.md). */
const TILE_PHOTO: Record<(typeof L.shops.tiles)[number]["key"], PhotoSet> = {
  cafe: PHOTOS.tCafe,
  repair: PHOTOS.tRepair,
  barber: PHOTOS.tBarber,
  nails: PHOTOS.tNails,
  corner: PHOTOS.tCorner,
  florist: PHOTOS.tFlorist,
};

/** Each tile's trade on the try-it picker (lib/marketing/try-card.ts TRY_TRADES keys). */
const TILE_TRADE = { cafe: "cafe", repair: "repair", barber: "barber", nails: "nails", corner: "corner", florist: "florist" } as const;

/**
 * Stamps fill in once as a pass scrolls into view: a few lines of plain script, no React. A pass already on screen fills at once; one
 * below waits ("wait") and fills when 40% of it shows ("in"). Nothing happens without IntersectionObserver or with reduced motion, and
 * the server markup is the filled card, so the stamps are never missing.
 */
const FILL_SCRIPT = `(()=>{try{if(!("IntersectionObserver"in window)||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.setAttribute("data-fill","in");io.unobserve(e.target)}})},{threshold:.4});document.querySelectorAll("[data-fill]").forEach(function(el){var r=el.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)el.setAttribute("data-fill","in");else{el.setAttribute("data-fill","wait");io.observe(el)}})}catch(e){}})()`;

/**
 * Wave W, plain script beside the fill: (1) the dots under each sideways row follow its scroll; (2) the phone's sticky button hides
 * while the hero's button, the card maker's button or the closing band's button is on screen ("data-hide"; the server markup starts
 * hidden, over the hero). Without IntersectionObserver it simply shows; without script the first dot stays marked.
 */
const SNAP_SCRIPT = `(()=>{try{document.querySelectorAll("[data-snap]").forEach(function(row){var d=row.nextElementSibling;if(!d||!d.hasAttribute("data-snap-dots"))return;var dots=d.children,t=0;row.addEventListener("scroll",function(){if(t)return;t=requestAnimationFrame(function(){t=0;var k=row.children,w=k.length>1?k[1].offsetLeft-k[0].offsetLeft:1,max=row.scrollWidth-row.clientWidth,i=Math.abs(row.scrollLeft)>=max-4?k.length-1:Math.round(Math.abs(row.scrollLeft)/Math.abs(w||1));for(var j=0;j<dots.length;j++)j===i?dots[j].setAttribute("data-on",""):dots[j].removeAttribute("data-on")})},{passive:true})});var s=document.querySelector(".lp-sticky");if(!s)return;if(!("IntersectionObserver"in window)){s.removeAttribute("data-hide");return}var on=new Set();var io=new IntersectionObserver(function(es){es.forEach(function(e){e.isIntersecting?on.add(e.target):on.delete(e.target)});on.size?s.setAttribute("data-hide",""):s.removeAttribute("data-hide")});document.querySelectorAll(".lp [data-cta=hero],.lp [data-cta=tryit],.lp [data-cta=final]").forEach(function(el){io.observe(el)})}catch(e){}})()`;

/**
 * The home page, wave V: direction B, the look the founder picked from three (dev/landing-b): Strata headlines (wave Y) with one Newsreader italic
 * phrase each, Halden text, black and white with grey bands, real photos (Unsplash, public/marketing/photos/CREDITS.md) and
 * the wallet pass drawn in code in a phone. Value first: the payoff in the hero, then a card maker the owner can try without signing up
 * (TrySection, the page's one client island beyond the visit form and the questions), then how it works, what they get, the shop
 * types (each tile presets the card maker), the plans, the dated comparison, questions, a visit, and the closing band.
 * Static, re-generated every 5 minutes for the live counts.
 */
export default function Home() {
  // The headline face, beside the CSS (lib/marketing/serif.ts): the h1 waits for it rather than flash Georgia.
  preloadSerif();
  const waUrl = whatsappUrl(L.book.whatsappText);
  const plans = marketingPlans("shop");
  const O = L.outcomes;
  return (
    // data-solo-trade="home": the landing beacon's page marker (LandingMeasure below); "/" is counted for the admin funnel (wave N).
    <div className={`mkt ${marketingFontVars} ${marketingSerifVar} lp`} data-solo-trade="home">
      {/* 1. The payoff (wave X): the headline, one line, one button; the phone cycling sample shops, one stamp each */}
      <section className="lp-hero" aria-labelledby="lp-title">
        <div className="lp-wrap lp-hero-grid">
          <div className="lp-hero-copy">
            <h1 className="lp-h1" id="lp-title" suppressHydrationWarning>
              <RiseTitle text={L.hero.title} />
            </h1>
            <script dangerouslySetInnerHTML={{ __html: RISE_SCRIPT }} />
            <p className="lp-lede">{L.hero.sub}</p>
            <div className="lp-ask">
              <Primary cta="hero" xl>
                {L.hero.primary}
              </Primary>
              <a className="lp-link lp-hero-try" href="#try" data-cta="how">
                {L.hero.secondary}
                <ArrowDown aria-hidden strokeWidth={2} />
              </a>
              <p className="lp-reassure">
                <b data-testid="hero-price">{reassure[0]}</b>
                {reassure.slice(1).map((r) => ` · ${r}`)}
              </p>
            </div>
          </div>
          <div className="lp-hero-art">
            <figure className="lp-photo lp-hero-photo">
              <Photo set={PHOTOS.heroBakery} alt={L.hero.photoAlt} sizes="(min-width: 1440px) 560px, 40vw" priority from={1024} />
            </figure>
            <div className="lp-hero-phone">
              <LivePhone />
            </div>
          </div>
        </div>
        <div className="lp-wrap">
          <div className="lp-proof">
            <LiveProof />
          </div>
        </div>
      </section>

      {/* 2. Try it now: the owner's own card, no sign-up (the client island) */}
      <TrySection />

      {/* 3. How it works: three panels, each with the thing itself */}
      <section className="lp-sec" id="how" aria-labelledby="lp-how">
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2" id="lp-how">
              <Emph text={L.how.title} />
            </h2>
            <p className="lp-lede">
              <Emph text={L.how.sub} />
            </p>
          </div>
          <ol className="lp-steps lp-snap" data-snap>
            <li>
              <div className="lp-panel lp-panel-pass" aria-hidden>
                <div className="lp-panel-pass-in">
                  <WalletPass data={P} fill />
                </div>
              </div>
              <span className="lp-step-n">1</span>
              <h3 className="lp-h3">{L.how.steps[0]!.t}</h3>
              <p className="lp-body">{L.how.steps[0]!.b}</p>
            </li>
            <li>
              <div className="lp-panel" aria-hidden>
                <div className="lp-tent">
                  <span className="lp-tent-logo">{P.mono}</span>
                  <span className="lp-tent-t">{fill(L.how.tent, { name: P.name })}</span>
                  <span className="lp-tent-qr">
                    <QrCode value="https://localloyalty.ca/j/little-oven" size={140} ecc="L" label={L.how.tentScan} />
                  </span>
                  <span className="lp-tent-s">{L.how.tentScan}</span>
                </div>
              </div>
              <span className="lp-step-n">2</span>
              <h3 className="lp-h3">{L.how.steps[1]!.t}</h3>
              <p className="lp-body">{L.how.steps[1]!.b}</p>
            </li>
            <li>
              <div className="lp-panel" aria-hidden>
                <StampAdded data={P} className="lp-panel-stamp" />
              </div>
              <span className="lp-step-n">3</span>
              <h3 className="lp-h3">{L.how.steps[2]!.t}</h3>
              <p className="lp-body">{L.how.steps[2]!.b}</p>
            </li>
          </ol>
          <Dots n={3} />
          {/* Wave X: the three doubts the hero used to answer, now under the steps. */}
          <ul className="lp-trust lp-how-trust">
            {L.hero.points.map((t) => (
              <li key={t}>
                <Check aria-hidden strokeWidth={2.5} />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 4. What you get, on the black band: four outcomes, each with its product moment (sample data, captioned) */}
      <section className="lp-sec lp-dark" id="product" aria-labelledby="lp-product">
        <div className="lp-wrap">
          <div className="lp-head">
            <h2 className="lp-h2" id="lp-product">
              <Emph text={O.title} />
            </h2>
            <p className="lp-lede">{f(O.sub)}</p>
          </div>
          <ul className="lp-gets lp-snap" data-snap>
            {O.rows.map((r) => (
              <li key={r.id} id={`outcome-${r.id}`} className="lp-get">
                <div className={`lp-get-art lp-get-${r.id}`} aria-hidden>
                  {"tag" in r && r.tag ? <span className="lp-tag-pro">{f(r.tag)}</span> : null}
                  {r.id === "pass" ? <WalletPass data={PASSES.cafe} fill /> : null}
                  {r.id === "stamp" ? <StampAdded data={PASSES.barber} /> : null}
                  {r.id === "winback" ? <WinBack /> : null}
                  {r.id === "week" ? <WeeklyCard shop={O.week.shop} /> : null}
                </div>
                <h3 className="lp-h3">
                  {r.title}
                  {"tag" in r && r.tag ? <span className="sr-only"> ({f(r.tag)})</span> : null}
                </h3>
                <p className="lp-body">{r.body}</p>
              </li>
            ))}
          </ul>
          <Dots n={O.rows.length} />
          <p className="lp-caption">{O.caption}</p>
          <div className="lp-ask lp-gets-end">
            <div className="lp-actions">
              <Primary cta="outcomes" tone="white" xl>
                {O.cta}
              </Primary>
              <a className="lp-link" href="#pricing" data-cta="seepricing">
                {O.pricing}
                <ArrowRight aria-hidden strokeWidth={2} />
              </a>
            </div>
            <Reassure />
          </div>
        </div>
      </section>

      {/* 5. The shop types: each tile is one link that presets the card maker to its trade */}
      <section className="lp-sec" id="shops" aria-labelledby="lp-shops">
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2" id="lp-shops">
              <Emph text={L.shops.title} />
            </h2>
            <p className="lp-lede">{L.shops.sub}</p>
          </div>
          <ul className="lp-tiles lp-snap" data-snap>
            {L.shops.tiles.map((t) => (
              <li key={t.key} className="lp-tile">
                <figure className="lp-tile-photo">
                  <Photo set={TILE_PHOTO[t.key]} alt={t.alt} sizes="(min-width: 1024px) 420px, (min-width: 640px) 46vw, 80vw" />
                </figure>
                <span className="lp-tile-k">{t.label}</span>
                <h3 className="lp-tile-t">{t.title}</h3>
                <p className="lp-tile-line">{t.line}</p>
                <a className="lp-tile-go" href="#try" data-try-trade={TILE_TRADE[t.key]}>
                  {t.link}
                  <ArrowRight aria-hidden strokeWidth={2} />
                </a>
              </li>
            ))}
          </ul>
          <Dots n={L.shops.tiles.length} />
          {/* The next step after the tiles: up to the card maker (an in-page link, not a sign-up link). */}
          <div className="lp-ask lp-shops-next">
            <a className="lp-btn lp-btn-black lp-btn-xl" href="#try" data-cta="shops">
              {L.shops.next}
              <ArrowRight aria-hidden strokeWidth={2} />
            </a>
            <p className="lp-reassure">{L.shops.nextNote}</p>
          </div>
          <div className="lp-also">
            {/* Plain anchors: the A/B landing pages count only a full page load (SiteFooter's LANDING_AB note). */}
            <nav aria-label={copy.solo.chipsLabel} className="lp-also-row">
              <span>{copy.solo.chipsLabel}</span>
              {copy.solo.chips
                .filter((c) => !c.href.includes("?"))
                .map((c) => (
                  <a key={c.href} href={c.href}>
                    {c.label}
                    <ArrowRight aria-hidden strokeWidth={2} />
                  </a>
                ))}
            </nav>
            <nav aria-label={L.shops.also} className="lp-also-row">
              <span>{L.shops.also}</span>
              {L.shops.more.map((m) => (
                <Link key={m.href} href={m.href} prefetch={false}>
                  <b>{m.label}</b> {m.line}
                  <ArrowRight aria-hidden strokeWidth={2} />
                </Link>
              ))}
            </nav>
          </div>
        </div>
      </section>

      {/* 6. Pricing on the grey band: every word from lib/marketing/plan-copy.ts, every number from PLANS; Pro is the black card */}
      <section className="lp-sec lp-grey" id="pricing" aria-labelledby="lp-pricing">
        <div className="lp-wrap">
          <div className="lp-head lp-head-c">
            <h2 className="lp-h2" id="lp-pricing">
              <Emph text={L.pricing.title} />
            </h2>
            <p className="lp-lede">{f(L.pricing.sub)}</p>
          </div>
          <div className="lp-plans">
            {plans.map((p) => (
              <div key={p.key} data-plan={p.key} className={`lp-plan lp-plan-${p.key}`}>
                <div className="lp-plan-h">
                  <span className="lp-plan-name">{p.name}</span>
                  {p.badge ? <span className="lp-plan-badge">{p.badge}</span> : null}
                </div>
                <span className="lp-plan-tag">{p.tagline}</span>
                <span className="lp-plan-price">
                  {p.price}
                  {p.per ? <small>{p.per}</small> : null}
                </span>
                <span className="lp-plan-yearly" data-plan={p.key === "monthly" ? "yearly" : undefined}>
                  {p.yearly ? (
                    p.yearly.was ? (
                      <>
                        {p.yearly.or} <s>{p.yearly.was}</s> <b>{p.yearly.now}</b> {p.yearly.label}
                      </>
                    ) : (
                      p.yearly.line
                    )
                  ) : null}
                </span>
                <Primary cta="pricing" tone={p.key === "monthly" ? "white" : "outline"}>
                  {p.cta}
                </Primary>
                <ul>
                  {p.features.map((x) => (
                    <li key={x}>
                      <Check aria-hidden strokeWidth={2.5} />
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="lp-plans-note">
            <span>{planNote("shop")}</span>
            <Link href="/pricing" prefetch={false} className="lp-link">
              {L.pricing.all}
            </Link>
            <span>
              {L.pricing.restaurants}{" "}
              <Link href="/for-restaurants" prefetch={false} className="lp-link">
                {L.pricing.restaurantsLink}
              </Link>
            </span>
          </p>
        </div>
      </section>

      {/* 7. How we compare: named, dated, sourced */}
      <CompetitorTable />

      {/* 8. Questions: the heading beside the hairline list */}
      <section className="lp-sec lp-sec-top0" aria-labelledby="lp-faq">
        <div className="lp-wrap lp-faq">
          <h2 className="lp-h2" id="lp-faq">
            <Emph text={L.faqTitle} />
          </h2>
          <Faq className="lp-faq-list" items={L.faq.map((q) => ({ q: q.q, a: f(q.a) }))} />
        </div>
      </section>

      {/* 9. A hand getting set up, on the grey band: a counter photo beside the visit form */}
      <section className="lp-sec lp-grey" id="book" aria-labelledby="lp-book">
        <div className="lp-wrap lp-book">
          <div className="lp-book-copy">
            <h2 className="lp-h2" id="lp-book">
              <Emph text={L.book.title} />
            </h2>
            <p className="lp-lede">
              <Emph text={L.book.sub} />
            </p>
            {waUrl ? (
              <a className="lp-btn lp-btn-outline" href={waUrl}>
                {L.book.whatsapp}
              </a>
            ) : null}
            <figure className="lp-photo lp-book-photo">
              <Photo set={PHOTOS.counterHelp} alt={L.book.photoAlt} sizes="(min-width: 1024px) 40vw, 100vw" />
            </figure>
          </div>
          <div className="lp-book-form">
            <ContactForm kind="visit" />
          </div>
        </div>
      </section>

      {/* 10. The closing ask, on the black band */}
      <section className="lp-final lp-dark" aria-labelledby="lp-final">
        <div className="lp-wrap lp-final-in">
          <h2 className="lp-h2 lp-h2-xl" id="lp-final">
            <Emph text={L.final.title} />
          </h2>
          <p className="lp-lede">
            <Emph text={L.final.sub} />
          </p>
          <div className="lp-ask">
            <div className="lp-actions">
              <Primary cta="final" tone="white" xl>
                {L.final.cta}
              </Primary>
              <a className="lp-link" href="#try" data-cta="finaltry">
                {L.final.tryIt}
                <ArrowRight aria-hidden strokeWidth={2} />
              </a>
            </div>
            <Reassure />
          </div>
        </div>
      </section>

      {/* Phones: the button in reach, hidden while the hero's, the card maker's or the closing band's own button is on screen (SNAP_SCRIPT). */}
      <div className="lp-sticky" data-hide="">
        <Primary cta="sticky">{L.sticky}</Primary>
      </div>
      <script dangerouslySetInnerHTML={{ __html: FILL_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: SNAP_SCRIPT }} />
      <script dangerouslySetInnerHTML={{ __html: VIDEO_SCRIPT }} />
      <LandingMeasure path="/" />
    </div>
  );
}
