import { copy } from "@/copy/en-CA";
import { HERO_VIDEO } from "./hero-video";
import { PASSES, Phone, WalletPass, type ShopKey } from "./Product";

/**
 * Wave Y: the hero's phone plays a produced video (scripts/hero-video: a scene drawn with the page's own pass styles and fonts, rendered
 * frame by frame and encoded to AV1, VP9 and H.264, about 12 s, looping). The page draws its first frame in HTML, the bakery pass at
 * 4/8 (SSR, no layout shift, the reduced-motion and Save-Data picture, and what shows until the video can play through), and
 * VIDEO_SCRIPT (plain script, no React) hands over to the video:
 *
 *   - nothing is fetched until the page has loaded and gone idle, and only once the phone is on screen (IntersectionObserver);
 *   - the video fades in over the HTML once it can play through, plays only while on screen and the tab is visible, and never under
 *     reduced motion or Save-Data;
 *   - the glow behind the phone follows the video's clock (video.currentTime against the cue points in hero-video.ts), so it
 *     takes the colour of the shop on screen.
 *
 * Every group that follows the video carries data-cue-set; its children are the shops in CUE_SHOPS order. React is told not to mind
 * the moved attributes.
 */

const H = copy.landing.hero;
const W = copy.landing.product;

/** The shops the video shows, in cue order. */
export const CUE_SHOPS: readonly ShopKey[] = ["bakery", "cafe", "repair"];
/** The wallet's other cards, stacked at the bottom of the screen (the same three in every frame of the video). */
const STACK: readonly ShopKey[] = ["barber", "nails", "florist"];
/** The video's first frame: the bakery pass one stamp before the one it gets. */
const FIRST = { ...PASSES.bakery, stamps: 4 };

const on = (i: number) => (i === 0 ? "" : undefined);

/** The phone: the wallet at the video's first frame in HTML, and the video over it (sources attached by VIDEO_SCRIPT). */
export function LivePhone() {
  return (
    <div className="lp-live" data-hero-video role="img" aria-label={H.phoneLabel} suppressHydrationWarning>
      <div className="lp-live-glow" data-cue-set aria-hidden>
        {CUE_SHOPS.map((k, i) => (
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
          <WalletPass data={FIRST} qr="https://localloyalty.ca/c/44712208" />
          <span className="wu-wallet-stack">
            {STACK.map((o) => (
              <span key={o} className="wu-wallet-sliver" data-shop={o}>
                <i>{PASSES[o].mono}</i>
                {PASSES[o].name}
              </span>
            ))}
          </span>
        </div>
        <video className="lp-live-video" width={HERO_VIDEO.width} height={HERO_VIDEO.height} muted loop playsInline preload="none" aria-hidden tabIndex={-1} suppressHydrationWarning>
          {HERO_VIDEO.sources.map((s) => (
            <source key={s.src} data-src={s.src} type={s.type} />
          ))}
        </video>
      </Phone>
    </div>
  );
}

/** Each cue as [seconds, index into CUE_SHOPS]. */
const CUES = JSON.stringify(HERO_VIDEO.cues.map(([t, k]) => [t, CUE_SHOPS.indexOf(k)]));

/**
 * Hands the phone over to the video (see the top of this file). Arms after `load` and an idle moment; attaches the sources when the
 * phone is on screen; fades in on canplaythrough; pauses off screen and in a hidden tab; steps the cue sets from currentTime on each
 * animation frame while playing (and after a seek). Under reduced motion or Save-Data, or without IntersectionObserver, it does nothing.
 */
export const VIDEO_SCRIPT = `(()=>{try{var r=document.querySelector("[data-hero-video]"),c=navigator.connection;if(!r||!("IntersectionObserver"in window)||matchMedia("(prefers-reduced-motion: reduce)").matches||c&&c.saveData)return;var v=r.querySelector("video"),S=document.querySelectorAll("[data-cue-set]"),C=${CUES},cur=0,vis=0,armed=0,att=0,ok=0,raf=0;function show(i){if(i===cur)return;var p=cur;cur=i;for(var a=0;a<S.length;a++){var k=S[a].children;for(var j=0;j<k.length;j++){j===i?k[j].setAttribute("data-on",""):k[j].removeAttribute("data-on");j===p?k[j].setAttribute("data-was",""):k[j].removeAttribute("data-was")}}}function step(){raf=0;var t=v.currentTime,i=0;for(var k=0;k<C.length;k++)if(t>=C[k][0])i=C[k][1];show(i);if(!v.paused)raf=requestAnimationFrame(step)}function go(){if(ok&&vis&&!document.hidden){var p=v.play();p&&p.catch(function(){});if(!raf)raf=requestAnimationFrame(step)}else if(ok)v.pause()}function attach(){if(att||!armed||!vis)return;att=1;v.muted=true;v.querySelectorAll("source").forEach(function(s){s.src=s.getAttribute("data-src")});v.addEventListener("canplaythrough",function(){ok=1;r.setAttribute("data-play","");go()},{once:true});v.addEventListener("playing",function(){if(!raf)raf=requestAnimationFrame(step)});v.addEventListener("seeked",step);v.preload="auto";v.load()}function arm(){armed=1;attach()}new IntersectionObserver(function(e){vis=e[e.length-1].isIntersecting;attach();go()}).observe(r);document.addEventListener("visibilitychange",go);var idle=function(){(window.requestIdleCallback||function(f){setTimeout(f,300)})(arm,{timeout:2500})};document.readyState==="complete"?idle():addEventListener("load",idle,{once:true})}catch(e){}})()`;

/**
 * The headline's words rise in once (landing.css). The headline face is font-display: block, so on a slow line the words are still
 * blank when the CSS starts their animation; this waits for both headline faces (Strata and the Newsreader italic, at most 3 s) before
 * letting them move, so the rise is seen. Transform only: the h1 is the phone's largest paint and is never held back.
 */
export const RISE_SCRIPT = `(()=>{try{var h=document.getElementById("lp-title"),f=document.fonts;if(!h||!f||matchMedia("(prefers-reduced-motion: reduce)").matches)return;var a="850 40px Strata",b="italic 400 40px Newsreader";if(f.check(a)&&f.check(b))return;h.setAttribute("data-fw","");var go=function(){h.removeAttribute("data-fw")};Promise.all([f.load(a),f.load(b)]).then(go,go);setTimeout(go,3000)}catch(e){}})()`;

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
