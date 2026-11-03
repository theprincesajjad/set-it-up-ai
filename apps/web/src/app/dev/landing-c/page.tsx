import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import { Manrope, Sora } from "next/font/google";
import Link from "next/link";
import { Photo } from "@/components/marketing/landing/Photo";
import { COPY_C as C } from "../_landing/copy";
import { PASSES, Phone, StampAdded, WalletScreen, WeeklyCard } from "../_landing/Product";
import { TILE_PHOTO, TopBar, UPHOTOS, devOnly } from "../_landing/shared";
import "./c.css";

export const metadata: Metadata = { title: "Landing C: benefit-led", robots: { index: false, follow: false } };

/**
 * Direction C, "benefit-led": Sora (SIL OFL 1.1) at 600 for headlines and figures, Manrope (SIL OFL 1.1) for text. A black hero with
 * a repair bench, Fix-It Phone Lab's cobalt pass on a phone and the week's regulars; how it works as three facts with big figures
 * beside a barber's counter; the shop types as white cards on grey. Dev only (shared.tsx devOnly).
 */
const sora = Sora({ subsets: ["latin"], weight: ["600"], variable: "--font-wc-display", display: "swap" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-wc-sans", display: "swap" });

/** The figure in front of each step: what the owner gets, as a number that is true. */
const FIGURES = [
  { n: "5", u: "min" },
  { n: "0", u: "apps" },
  { n: "1", u: "tap" },
] as const;

export default async function LandingC() {
  await devOnly();
  return (
    <div className={`mkt ${sora.variable} ${manrope.variable} wc`}>
      <div className="wc-dark">
        <TopBar cta={C.nav} prefix="wc" onBlack />
        <main id="main">
          {/* Hero: the benefit, the proof, a repair bench with the shop's card and its week */}
          <section className="wc-hero" aria-labelledby="wc-title">
            <div className="wc-wrap wc-hero-grid">
              <div className="wc-hero-copy">
                <h1 className="wc-h1" id="wc-title">
                  <span>{C.hero.title}</span> <span className="wc-quiet">{C.hero.titleQuiet}</span>
                </h1>
                <p className="wc-lede">{C.hero.sub}</p>
                <div className="wc-actions">
                  <Link href="/signup" prefetch={false} className="wc-btn wc-btn-white" data-cta="hero">
                    {C.hero.primary}
                  </Link>
                  <a href="#how" className="wc-btn wc-btn-line" data-cta="how">
                    {C.hero.secondary}
                  </a>
                </div>
                <ul className="wc-chips">
                  {C.hero.chips?.map((c) => (
                    <li key={c}>
                      <Check aria-hidden strokeWidth={2.5} />
                      {c}
                    </li>
                  ))}
                </ul>
                <p className="wc-note">{C.hero.note}</p>
              </div>
              <div className="wc-hero-art">
                <figure className="wc-photo">
                  <Photo set={UPHOTOS.repair} alt="A technician repairing a phone's circuit board at his bench" sizes="(min-width: 1024px) 600px, 100vw" priority />
                </figure>
                <Phone tone="wallet" className="wc-hero-phone">
                  <WalletScreen data={PASSES.repair} />
                </Phone>
                <WeeklyCard className="wc-hero-week" total={24} change={6} days={[3, 4, 2, 5, 4, 6, 0]} shop="Fix-It" />
              </div>
            </div>
          </section>
        </main>
      </div>

      {/* How it works: three facts with big figures, beside a barber's counter with the stamp moment */}
      <section className="wc-how" id="how" aria-labelledby="wc-how">
        <div className="wc-wrap">
          <div className="wc-head">
            <h2 className="wc-h2" id="wc-how">
              {C.how.title}
            </h2>
            <p className="wc-lede wc-lede-light">{C.how.sub}</p>
          </div>
          <div className="wc-how-grid">
            <ol className="wc-steps">
              {C.how.steps.map((s, i) => (
                <li key={s.t}>
                  <span className="wc-fig" aria-hidden>
                    {(FIGURES[i] ?? FIGURES[0]).n}
                    <small>{(FIGURES[i] ?? FIGURES[0]).u}</small>
                  </span>
                  <div>
                    <h3 className="wc-h3">{s.t}</h3>
                    <p className="wc-body">{s.b}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="wc-how-art">
              <figure className="wc-how-photo">
                <Photo set={UPHOTOS.barber} alt="A barber finishing a client's cut" sizes="(min-width: 1024px) 560px, 100vw" />
              </figure>
              <StampAdded data={PASSES.barber} className="wc-how-stamp" />
            </div>
          </div>
        </div>
      </section>

      {/* Shop types: white cards on grey */}
      <section className="wc-shops" id="shops" aria-labelledby="wc-shops">
        <div className="wc-wrap">
          <div className="wc-head wc-head-row">
            <div>
              <h2 className="wc-h2" id="wc-shops">
                {C.shops.title}
              </h2>
              <p className="wc-lede wc-lede-light">{C.shops.sub}</p>
            </div>
            <Link href="/signup" prefetch={false} className="wc-btn" data-cta="shops">
              {C.shops.cta}
              <ArrowRight aria-hidden />
            </Link>
          </div>
          <ul className="wc-tiles">
            {C.shops.tiles.map((t) => (
              <li key={t.key} className="wc-tile">
                <figure className="wc-tile-photo">
                  <Photo set={TILE_PHOTO[t.key]} alt="" sizes="(min-width: 1024px) 420px, 50vw" />
                </figure>
                <div className="wc-tile-text">
                  <h3 className="wc-tile-t">{t.label}</h3>
                  <p className="wc-tile-line">{t.line}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
