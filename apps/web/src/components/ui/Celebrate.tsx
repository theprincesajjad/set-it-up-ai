"use client";
/**
 * Kit (wave Q): a short confetti burst for a real milestone ("You're live", a reward unlocked, the first visit). canvas-confetti 1.9.4 (ISC),
 * the same engine as Magic UI's Confetti, loaded on demand: nothing ships until `celebrate()` runs (about 6 kB gzip, its own chunk).
 *
 *   celebrate()                                   one burst from the top centre, in the shop's colours
 *   celebrate({ origin: el })                     from an element (the reward card, the check mark)
 *   <Celebration when={isLive} />                 fires once when `when` turns true (and never again for that mount)
 *
 * Colours are read from the tokens at fire time (--trade, --points, --success, --primary, plus their soft fills), so it wears the shop's
 * brand colour under shopColorProps and never hard-codes a hex. prefers-reduced-motion: nothing is drawn (the milestone screen itself is
 * the celebration). The canvas is pointer-events: none and aria-hidden; say the milestone in text, not with confetti.
 */
import { useEffect, useRef } from "react";

export interface CelebrateOptions {
  /** Where the burst comes from: an element (its centre), or a point in 0..1 viewport units. Default: top centre. */
  origin?: Element | { x: number; y: number } | null;
  /** "burst" (one pop, default), "sides" (two cannons from the bottom corners, for the biggest moment). */
  kind?: "burst" | "sides";
  /** Token names to colour the pieces; default the shop's trade colour, points, success and ink. */
  tokens?: string[];
}

const DEFAULT_TOKENS = ["--trade", "--trade-soft", "--points", "--success", "--primary"];

/** A CSS colour (any syntax the browser knows: oklch, color-mix, rgb) as #rrggbb, by painting one pixel. */
function toHex(css: string): string | null {
  if (!css) return null;
  const c = document.createElement("canvas");
  c.width = c.height = 1;
  const g = c.getContext("2d");
  if (!g) return null;
  g.fillStyle = css;
  g.fillRect(0, 0, 1, 1);
  const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
  if (!a) return null;
  return `#${[r, gr, b].map((v) => v!.toString(16).padStart(2, "0")).join("")}`;
}

function tokenColours(tokens: string[], from: Element | null): string[] {
  const style = getComputedStyle(from ?? document.documentElement);
  const out = tokens.map((t) => toHex(style.getPropertyValue(t).trim())).filter((x): x is string => !!x);
  if (out.length) return out;
  const ink = toHex(getComputedStyle(document.body).color);
  return ink ? [ink] : [];
}

function reducedMotion() {
  return typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Fire once. Resolves when the pieces have been launched (or immediately when motion is reduced). */
export async function celebrate(opts: CelebrateOptions = {}): Promise<void> {
  if (reducedMotion()) return;
  const { default: confetti } = await import("canvas-confetti");
  const el = opts.origin instanceof Element ? opts.origin : null;
  let origin = { x: 0.5, y: 0.3 };
  if (el) {
    const r = el.getBoundingClientRect();
    origin = { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
  } else if (opts.origin && !(opts.origin instanceof Element)) origin = opts.origin;
  const colors = tokenColours(opts.tokens ?? DEFAULT_TOKENS, el ?? document.querySelector("[data-shop-color], [data-trade]"));
  const base = { colors, disableForReducedMotion: true, zIndex: 80, ticks: 220, scalar: 0.9 };
  if (opts.kind === "sides") {
    void confetti({ ...base, particleCount: 70, angle: 60, spread: 60, startVelocity: 55, origin: { x: 0, y: 0.9 } });
    void confetti({ ...base, particleCount: 70, angle: 120, spread: 60, startVelocity: 55, origin: { x: 1, y: 0.9 } });
    return;
  }
  void confetti({ ...base, particleCount: 90, spread: 75, startVelocity: 38, origin });
}

/** Fires `celebrate` once, after paint, the first time `when` is true. Renders nothing. */
export function Celebration({ when = true, delay = 250, ...opts }: CelebrateOptions & { when?: boolean; /** ms after the screen appears. */ delay?: number }) {
  const done = useRef(false);
  const { origin, kind, tokens } = opts;
  useEffect(() => {
    if (!when || done.current) return;
    const id = window.setTimeout(() => {
      done.current = true;
      void celebrate({ origin, kind, tokens });
    }, delay);
    return () => window.clearTimeout(id);
    // Fire once per mount: later option changes do not re-fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [when, delay]);
  return null;
}
