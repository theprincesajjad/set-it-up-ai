import { copy } from "@/copy/en-CA";
import { PASSES, Phone, WalletPass, type ShopKey } from "./Product";

/**
 * Wave X: the hero's moving parts, all server-rendered, driven by LIVE_SCRIPT (a few lines of plain script, no React).
 *
 *   - the trade pill above the headline ("For bakeries", then cafés, barbers ...) and
 *   - the phone beside it, whose pass switches to that trade's sample shop (PASSES, the same names, colours and icons the rest of the
 *     page draws), pops in the next stamp and drops a "Stamp added" banner, with a soft glow behind it in the pass's colour.
 *
 * Every group that cycles carries data-live-set; its children are the cycle's steps, in LIVE order. The server markup is step one
 * (the bakery, data-on), so nothing shifts or flashes when the script starts. The script moves data-on (and data-was, the step just
 * left) every 2.4 s, only while the hero is on screen and the tab is visible, and never under reduced motion; the CSS
 * (landing.css, "Wave X") does the rest with transform and opacity. React is told not to mind the moved attributes.
 */

const H = copy.landing.hero;
const N = copy.landing.tryIt.notice;
const W = copy.landing.product;

/** The cycle, in step with H.trades (the pill's words). */
export const LIVE: readonly ShopKey[] = ["bakery", "cafe", "barber", "repair", "nails", "florist"];

const on = (i: number) => (i === 0 ? "" : undefined);

/** The pill: a dot in the shop's colour, "For", and the trade word sliding up into place. */
export function TradePill() {
  return (
    <p className="lp-pill">
      <span className="sr-only">{H.tradesAll}</span>
      <span className="lp-pill-dots" data-live-set aria-hidden>
        {LIVE.map((k, i) => (
          <i key={k} data-shop={k} data-on={on(i)} suppressHydrationWarning />
        ))}
      </span>
      <span aria-hidden>{H.for}</span>
      <span className="lp-pill-words" data-live-set aria-hidden>
        {H.trades.map((t, i) => (
          <span key={t} data-on={on(i)} suppressHydrationWarning>
            {t}
          </span>
        ))}
      </span>
    </p>
  );
}

const fillIn = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k: string) => String(v[k] ?? ""));

/** The phone: one wallet screen with the six sample passes stacked (one shown), each with its "Stamp added" banner and glow. */
export function LivePhone() {
  return (
    <div className="lp-live" data-live role="img" aria-label={H.phoneLabel}>
      <div className="lp-live-glow" data-live-set aria-hidden>
        {LIVE.map((k, i) => (
          <i key={k} data-shop={k} data-on={on(i)} suppressHydrationWarning />
        ))}
      </div>
      <Phone tone="wallet" className="lp-live-phone">
        <div className="wu-wallet" aria-hidden>
          <div className="wu-wallet-top">
            <span className="wu-wallet-done">{W.done}</span>
            <span className="wu-wallet-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="lp-live-passes" data-live-set>
            {LIVE.map((k, i) => (
              <div key={k} className="lp-live-pass" data-on={on(i)} suppressHydrationWarning>
                <WalletPass data={PASSES[k]} newest qr="https://localloyalty.ca/c/44712208" />
                <span className="wu-wallet-stack">
                  {LIVE.filter((o) => o !== k)
                    .slice(0, 3)
                    .map((o) => (
                      <span key={o} className="wu-wallet-sliver" data-shop={o}>
                        <i>{PASSES[o].mono}</i>
                        {PASSES[o].name}
                      </span>
                    ))}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="lp-live-banners" data-live-set aria-hidden>
          {LIVE.map((k, i) => {
            const p = PASSES[k];
            return (
              <div key={k} className="lp-notice lp-live-banner" data-shop={k} data-on={on(i)} suppressHydrationWarning>
                <span className="lp-notice-icon">{p.mono}</span>
                <span className="lp-notice-text">
                  <span className="lp-notice-top">
                    <span>{p.name}</span>
                    <small>{N.now}</small>
                  </span>
                  <b>{N.stamps}</b>
                  <span>{fillIn(W.left, { n: p.of - p.stamps, reward: p.reward.toLowerCase() })}</span>
                </span>
              </div>
            );
          })}
        </div>
      </Phone>
    </div>
  );
}

/**
 * Steps every [data-live-set] together. Waits for the hero to be on screen (IntersectionObserver) and the tab to be visible; does
 * nothing under reduced motion. Without IntersectionObserver it simply runs.
 */
export const LIVE_SCRIPT = `(()=>{try{var r=document.querySelector("[data-live]");if(!r||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var S=document.querySelectorAll("[data-live-set]"),n=S[0].children.length,i=0,t=0,v=!("IntersectionObserver"in window);function go(){var p=i;i=(i+1)%n;for(var a=0;a<S.length;a++){var k=S[a].children;for(var j=0;j<k.length;j++){j===i?k[j].setAttribute("data-on",""):k[j].removeAttribute("data-on");j===p?k[j].setAttribute("data-was",""):k[j].removeAttribute("data-was")}}}function run(){clearInterval(t);t=0;if(v&&!document.hidden)t=setInterval(go,2400)}if(!v)new IntersectionObserver(function(e){v=e[e.length-1].isIntersecting;run()}).observe(r);document.addEventListener("visibilitychange",run);run()}catch(e){}})()`;

/**
 * The headline's words rise in once (landing.css). The headline face is font-display: block, so on a slow line the words are still
 * blank when the CSS starts their animation; this waits for both Newsreader faces (at most 3 s) before letting them move, so the rise
 * is seen. Transform only: the h1 is the phone's largest paint and is never held back.
 */
export const RISE_SCRIPT = `(()=>{try{var h=document.getElementById("lp-title"),f=document.fonts;if(!h||!f||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var a="500 40px Newsreader",b="italic 400 40px Newsreader";if(f.check(a)&&f.check(b))return;h.setAttribute("data-fw","");var go=function(){h.removeAttribute("data-fw")};Promise.all([f.load(a),f.load(b)]).then(go,go);setTimeout(go,3000)}catch(e){}})()`;

/** The headline, one span per word (the rise), the italic phrase on its own line with the drawn underline. */
export function RiseTitle({ text }: { text: string }) {
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  let w = 0;
  const words = (s: string) =>
    s
      .trim()
      .split(/\s+/)
      .flatMap((x, i, all) => [
        <span key={w} className="lp-w" style={{ "--w": w++ } as React.CSSProperties}>
          {x}
        </span>,
        i < all.length - 1 ? " " : null,
      ]);
  return parts.map((p, i) =>
    p.startsWith("*") ? (
      <em key={i}>{words(p.slice(1, -1))}</em>
    ) : (
      <span key={i}>
        {words(p)}
        {p.endsWith(" ") ? " " : null}
      </span>
    ),
  );
}
