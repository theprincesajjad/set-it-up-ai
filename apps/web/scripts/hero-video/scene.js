/*
 * The hero video's one timeline (wave Y). `render(t)` sets every moving thing for time t in seconds, as a pure function of t: no
 * CSS transitions, no timers, no randomness. render.mjs calls it for each of the 720 frames (12 s at 60 fps) and screenshots the screen;
 * scrub.html calls it from a slider to review the motion by hand (open it from the file system). Frame 0 (t = 0) and t = 12 are the same picture, the bakery pass at
 * 4/8 at rest, which is also what the home page draws before the video plays (HeroLive.tsx), so the loop and the hand-over are seamless.
 *
 * Story: Little Oven (4/8) gets a tap, a stamp and a banner; the wallet brings up Pinecone Coffee (8/10, a stamp); then Fix-It Phone Lab
 * (points, 90 to 105 of 150); then Pinecone again, whose tenth stamp makes the reward ready (a glow, a few sparkles, "Reward ready");
 * then Little Oven rises back into place for the loop.
 */
(() => {
  const T = 12;
  /** When each pass starts rising into view: the page's trade pill follows these (render.mjs writes them to hero-video.ts). */
  const CUES = [
    [0, "bakery"],
    [2.7, "cafe"],
    [5.5, "repair"],
    [8.3, "cafe"],
    [11.3, "bakery"],
  ];

  // ---------- easing ----------
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const prog = (t, a, d) => clamp((t - a) / d);
  const outQuart = (x) => 1 - (1 - x) ** 4;
  const outQuint = (x) => 1 - (1 - x) ** 5;
  const inCubic = (x) => x * x * x;
  const inOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);
  /** A damped spring from 0 to 1, `s` seconds after it starts (zeta < 1 overshoots). */
  const spring = (s, w = 16, z = 0.6) => {
    if (s <= 0) return 0;
    const wd = w * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
  };
  const mix = (a, b, x) => a + (b - a) * x;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const screen = $("[data-screen]");
  const cq = () => $(".wu-phone").getBoundingClientRect().width / 100;
  const pass = { bakery: $('[data-v="bakery"]'), cafe: $('[data-v="cafe"]'), repair: $('[data-v="repair"]') };
  const banner = $("[data-banner]");

  /** Where each pass is: rising (from below the stack), at rest, or sinking. Returns { y, z } (y: 0 at rest, 1 out of sight). */
  function place(k, t) {
    // Visible windows: bakery [0, 2.55+0.5] and [11.3, 12]; cafe [2.7, 5.85] and [8.3, 11.65]; repair [5.5, 8.65].
    const rise = (a, end) => {
      const p = prog(t, a, 0.7);
      return end ? 1 - outQuint(p) : 1 - spring(t - a, 13, 0.82);
    };
    const sink = (a) => inCubic(prog(t, a, 0.5));
    let y = 1;
    if (k === "bakery") {
      if (t < 2.55) y = 0;
      else if (t < 3.1) y = sink(2.55);
      else if (t >= 11.3) y = rise(11.3, true);
    } else if (k === "cafe") {
      if (t >= 2.7 && t < 5.35) y = rise(2.7);
      else if (t >= 5.35 && t < 5.9) y = sink(5.35);
      else if (t >= 8.3 && t < 11.15) y = rise(8.3);
      else if (t >= 11.15 && t < 11.7) y = sink(11.15);
    } else {
      if (t >= 5.5 && t < 8.15) y = rise(5.5);
      else if (t >= 8.15 && t < 8.7) y = sink(8.15);
    }
    // Arriving passes are drawn over leaving ones.
    const arriving = (k === "bakery" && t >= 11.3) || (k === "cafe" && ((t >= 2.7 && t < 5.35) || (t >= 8.3 && t < 11.15))) || (k === "repair" && t >= 5.5 && t < 8.15);
    return { y, z: arriving ? 3 : 2 };
  }

  /** The tap: the code dips a little and two soft rings spread from it. */
  function tap(el, t, at) {
    const qr = $(".wu-pass-qr", el);
    const d = t - at;
    const dip = d > 0 && d < 0.5 ? Math.sin(Math.PI * clamp(d / 0.42)) * 0.035 : 0;
    qr.style.transform = dip ? `scale(${1 - dip})` : "";
    $$("[data-ring]", el).forEach((r, i) => {
      const p = prog(t, at + 0.06 + i * 0.14, 0.8);
      r.style.opacity = p > 0 && p < 1 ? String(0.55 * (1 - p) ** 1.5) : "0";
      r.style.transform = `translate(-50%, -50%) scale(${mix(0.55, 1.75, outQuart(p))})`;
    });
  }

  /** A stamp pressed in: the filled disc springs from nothing with a little overshoot, and a thin ring spreads past it. */
  function stamp(el, i, t, at, until = T + 1) {
    const s = $$(".wu-stamp", el)[i];
    const disc = $("[data-disc]", s);
    const ring = $("[data-pop]", s);
    const on = t >= at && t < until;
    const k = on ? spring(t - at, 19, 0.5) : 0;
    disc.style.opacity = on ? String(clamp((t - at) / 0.06)) : "0";
    // An empty slot is a faint ring (product.css); once pressed it is a full-strength stamp.
    s.style.opacity = on ? "1" : "";
    disc.style.transform = `scale(${k})`;
    const p = on ? prog(t, at + 0.1, 0.6) : 0;
    ring.style.opacity = p > 0 && p < 1 ? String(0.8 * (1 - p)) : "0";
    ring.style.transform = `scale(${mix(0.9, 1.45, outQuart(p))})`;
  }

  /** The count in the pass's head: the text changes mid-way through a small lift-and-settle. */
  function tick(el, t, at, before, after, until = T + 1) {
    const b = $(".wu-pass-head .wu-pass-field b", el);
    const d = t - at;
    const done = t >= at + 0.14 && t < until;
    const text = done ? after : before;
    if (b.textContent !== text) b.textContent = text;
    if (d > 0 && d < 0.14 && t < until) {
      const x = d / 0.14;
      b.style.transform = `translateY(${-0.35 * x}em)`;
      b.style.opacity = String(1 - x);
    } else if (d >= 0.14 && d < 0.5 && t < until) {
      const x = outQuart((d - 0.14) / 0.36);
      b.style.transform = `translateY(${0.35 * (1 - x)}em)`;
      b.style.opacity = String(x);
    } else {
      b.style.transform = "";
      b.style.opacity = "";
    }
  }

  const BANNERS = [
    // [drop, lift, shop, top line, title, body]
    [1.1, 2.4, "bakery", "Little Oven", "Stamp added", "3 more to a free loaf"],
    [4.2, 5.3, "cafe", "Pinecone Coffee", "Stamp added", "1 more to a free drink"],
    [7.0, 8.1, "repair", "Fix-It Phone Lab", "15 points added", "45 more to a free screen protector"],
    [9.9, 11.0, "cafe", "Pinecone Coffee", "Reward ready", "Free drink · Show this card"],
  ];
  function drawBanner(t) {
    const b = BANNERS.find(([a, l]) => t >= a && t < l + 0.4);
    if (!b) {
      banner.style.opacity = "0";
      return;
    }
    const [a, l, shop, name, title, body] = b;
    if (banner.dataset.shop !== shop) banner.dataset.shop = shop;
    const set = (sel, v) => {
      const e = $(sel, banner);
      if (e.textContent !== v) e.textContent = v;
    };
    set(".lp-notice-icon", name[0]);
    set(".lp-notice-top span", name);
    set(".lp-notice-text b", title);
    set(".lp-notice-text > span:last-child", body);
    banner.toggleAttribute("data-ready", title === "Reward ready");
    const h = banner.getBoundingClientRect().height + 14 * cq();
    if (t < l) {
      const k = spring(t - a, 15, 0.78);
      banner.style.transform = `translateY(${-(1 - k) * h}px) scale(${mix(0.94, 1, k)})`;
      banner.style.opacity = String(clamp((t - a) / 0.12));
    } else {
      const x = inCubic(prog(t, l, 0.32));
      banner.style.transform = `translateY(${-x * h * 0.7}px) scale(${mix(1, 0.97, x)})`;
      banner.style.opacity = String(1 - outQuart(prog(t, l + 0.05, 0.27)));
    }
  }

  /** Fix-It's points: the bar grows from 90 to 105 of 150 and the count runs up with it. */
  function points(t) {
    const el = pass.repair;
    const p = outQuart(prog(t, 6.75, 0.8));
    const v = Math.round(mix(90, 105, p));
    $(".wu-pass-bar i", el).style.setProperty("--to", String(v / 150));
    const b = $(".wu-pass-head .wu-pass-field b", el);
    const text = `${v}/150`;
    if (b.textContent !== text) b.textContent = text;
  }

  /** The reward: a slow warm glow around the card, one sheen across it, the stamps pulse in turn, and four small sparkles. */
  function reward(t) {
    const el = pass.cafe;
    const card = $(".wu-pass-card", el);
    const on = t >= 9.7 && t < 11.7;
    const g = on ? Math.min(outQuart(prog(t, 9.7, 0.6)), 1 - inOut(prog(t, 11.0, 0.5))) : 0;
    card.style.boxShadow = g
      ? `0 0 0 ${0.5 * cq()}px rgb(243 226 180 / ${0.55 * g}), 0 0 ${9 * cq()}px ${1.5 * cq()}px rgb(240 200 120 / ${0.5 * g}), 0 0.5px 0 rgb(255 255 255 / 0.12) inset, 0 1px 2px rgb(0 0 0 / 0.16), 0 18px 40px -8px rgb(0 0 0 / 0.36)`
      : "";
    const sh = $("[data-sheen]", el);
    const sp = prog(t, 9.8, 1.1);
    sh.style.opacity = sp > 0 && sp < 1 ? "1" : "0";
    sh.style.transform = `translateX(${mix(-120, 140, inOut(sp))}%) skewX(-16deg)`;
    $$(".wu-stamp", el).forEach((s, i) => {
      const d = t - (9.85 + i * 0.045);
      const k = d > 0 && d < 0.36 && on ? Math.sin((Math.PI * d) / 0.36) * 0.09 : 0;
      s.style.transform = k ? `scale(${1 + k})` : "";
    });
    $$("[data-spark]", el.parentElement).forEach((s, i) => {
      const p = on ? prog(t, 9.85 + i * 0.16, 0.9) : 0;
      const k = p > 0 && p < 1 ? Math.sin(Math.PI * p) : 0;
      s.style.opacity = String(k);
      s.style.transform = `translate(-50%, -50%) scale(${0.4 + 0.6 * k}) rotate(${mix(-20, 40, p)}deg)`;
    });
  }

  function render(t) {
    t = ((t % T) + T) % T;
    const drop = screen.getBoundingClientRect().height;
    for (const k of Object.keys(pass)) {
      const el = pass[k];
      const { y, z } = place(k, t);
      const top = el.offsetTop;
      el.style.zIndex = String(z);
      el.style.transform = y ? `translateY(${y * (drop - top + 8)}px) scale(${mix(1, 0.97, y)})` : "";
      el.style.visibility = y >= 1 ? "hidden" : "visible";
    }
    // Little Oven: a stamp at 0.85 s (4/8 to 5/8), reset once it is out of sight.
    tap(pass.bakery, t, 0.5);
    stamp(pass.bakery, 4, t, 0.85, 11.3);
    tick(pass.bakery, t, 0.9, "4/8", "5/8", 11.3);
    // Pinecone: 8/10 to 9/10, then later 9/10 to 10/10, the reward.
    tap(pass.cafe, t, t < 8 ? 3.6 : 9.2);
    stamp(pass.cafe, 8, t, 3.95, 11.7);
    stamp(pass.cafe, 9, t, 9.55, 11.7);
    tick(pass.cafe, t, t < 8 ? 4.0 : 9.6, t < 8 ? "8/10" : "9/10", t < 8 ? "9/10" : "10/10", 11.7);
    if (t >= 11.7 || t < 2) tick(pass.cafe, t, 99, "8/10", "8/10");
    // Fix-It: points.
    tap(pass.repair, t, 6.4);
    points(t);
    reward(t);
    drawBanner(t);
  }

  window.HERO = { T, CUES, render };
})();
