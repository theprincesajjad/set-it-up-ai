"use client";
/**
 * Liquid Glass refraction (v3.2-clear.md 2.8 "Refraction", copied from the v6 mock): for every `[data-lens]` element, draw a displacement map
 * (a rounded-rect signed-distance field with a convex bezel, so the edge band bends the backdrop and the centre stays clear), put it in an SVG
 * filter (feGaussianBlur -> feImage -> feDisplacementMap -> feColorMatrix saturate) and set `backdrop-filter: url(#id) blur(...)`.
 *
 * Progressive enhancement: Chromium only (Safari and Firefox ignore url() in backdrop-filter and keep plain blur + saturate), Clear only, off under
 * prefers-reduced-transparency and `html.solid`. Filters are built once per element size, not per frame. Optional per element:
 * `data-lens-r` (corner radius, default the computed radius) and `data-lens-bezel` (bezel width, default min(20, h/2)).
 */
import { useEffect } from "react";

function isChromium() {
  const ua = navigator.userAgent;
  return (/Chrom(e|ium)/.test(ua) && !/OPR\//.test(ua)) || /Edg\//.test(ua);
}

/** The feature test: Chromium, Clear, transparency allowed, and the browser takes a url() backdrop filter. */
export function lensSupported(): boolean {
  if (typeof window === "undefined" || typeof CSS === "undefined") return false;
  const root = document.documentElement;
  if (root.getAttribute("data-theme-style") !== "clear" || root.classList.contains("solid")) return false;
  if (window.matchMedia("(prefers-reduced-transparency: reduce)").matches) return false;
  return isChromium() && CSS.supports("backdrop-filter", "url(#x) blur(1px)");
}

/** The mock's lensMap(): R and G carry the x and y displacement, 128 is no shift. */
export function lensMap(w: number, h: number, r: number, b: number): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d");
  if (!x) return "";
  const img = x.createImageData(w, h);
  const d = img.data;
  const hw = w / 2;
  const hh = h / 2;
  r = Math.min(r, hw, hh);
  b = Math.min(b, Math.min(hw, hh));
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      const px = i + 0.5 - hw;
      const py = j + 0.5 - hh;
      const qx = Math.abs(px) - (hw - r);
      const qy = Math.abs(py) - (hh - r);
      const ox = Math.max(qx, 0);
      const oy = Math.max(qy, 0);
      const dist = -(Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r);
      let nx = 0;
      let ny = 0;
      if (qx > 0 && qy > 0) {
        const l = Math.hypot(qx, qy) || 1;
        nx = (Math.sign(px) * qx) / l;
        ny = (Math.sign(py) * qy) / l;
      } else if (qx > qy) nx = Math.sign(px);
      else ny = Math.sign(py);
      let m = 0;
      if (dist < b) {
        const t = 1 - Math.max(dist, 0) / b;
        m = t * t * (3 - 2 * t) * t; // convex bezel: strong at the rim, easing to zero inside
      }
      const k = (j * w + i) * 4;
      d[k] = 128 + 127 * nx * m;
      d[k + 1] = 128 + 127 * ny * m;
      d[k + 2] = 128;
      d[k + 3] = 255;
    }
  x.putImageData(img, 0, 0);
  return c.toDataURL();
}

const SVG_NS = "http://www.w3.org/2000/svg";

function lens(el: HTMLElement, defs: SVGDefsElement, id: string) {
  const rc = el.getBoundingClientRect();
  const w = Math.round(rc.width);
  const h = Math.round(rc.height);
  if (w < 20 || h < 20) return;
  const key = `${w}x${h}`;
  if (el.dataset.lensKey === key) return;
  el.dataset.lensKey = key;
  const cs = getComputedStyle(el);
  const r = +(el.dataset.lensR || parseFloat(cs.borderTopLeftRadius) || 12);
  const bz = +(el.dataset.lensBezel || Math.min(20, h / 2));
  const small = Math.min(w, h) < 60;
  const strong = el.classList.contains("glass-sheet") || el.classList.contains("glass-side");
  const scale = small ? bz * 2.4 : bz * 2.2;
  const blur = strong ? 22 : small ? 12 : 16;
  const sat = document.documentElement.getAttribute("data-theme") === "dark" ? 1.5 : 1.7;
  defs.querySelector(`#${id}`)?.remove();
  const f = document.createElementNS(SVG_NS, "filter");
  f.setAttribute("id", id);
  f.setAttribute("x", "0");
  f.setAttribute("y", "0");
  f.setAttribute("width", String(w));
  f.setAttribute("height", String(h));
  f.setAttribute("filterUnits", "userSpaceOnUse");
  f.setAttribute("color-interpolation-filters", "sRGB");
  f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" edgeMode="duplicate" result="b"/><feImage href="${lensMap(w, h, r, bz)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/><feDisplacementMap in="b" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="d"/><feColorMatrix in="d" type="saturate" values="${sat}"/>`;
  defs.appendChild(f);
  const bf = `url(#${id}) blur(${strong ? "var(--lg-blur-strong)" : small ? "14px" : "var(--lg-blur)"})`;
  el.style.setProperty("backdrop-filter", bf);
  el.style.setProperty("-webkit-backdrop-filter", bf);
}

function clearLens(el: HTMLElement) {
  delete el.dataset.lensKey;
  el.style.removeProperty("backdrop-filter");
  el.style.removeProperty("-webkit-backdrop-filter");
}

/** Mount once per shell. Re-runs on resize, on theme changes and when [data-lens] elements come and go. */
export function LiquidGlassLens() {
  useEffect(() => {
    // Feature detection before anything else: no observers (old browsers, jsdom), no lens.
    if (typeof ResizeObserver === "undefined" || typeof MutationObserver === "undefined" || typeof window.matchMedia !== "function") return;
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("width", "0");
    svg.setAttribute("height", "0");
    svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    const defs = document.createElementNS(SVG_NS, "defs") as SVGDefsElement;
    svg.appendChild(defs);
    document.body.appendChild(svg);
    const ids = new WeakMap<HTMLElement, string>();
    let n = 0;
    let frame = 0;
    const run = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const els = [...document.querySelectorAll<HTMLElement>("[data-lens]")];
        if (!lensSupported()) {
          els.forEach(clearLens);
          return;
        }
        for (const el of els) {
          if (!ids.has(el)) ids.set(el, `ll-lens-${n++}`);
          lens(el, defs, ids.get(el)!);
        }
      });
    };
    run();
    const ro = new ResizeObserver(run);
    const watchSizes = () => document.querySelectorAll<HTMLElement>("[data-lens]").forEach((el) => ro.observe(el));
    watchSizes();
    const mo = new MutationObserver(() => {
      watchSizes();
      run();
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const rootMo = new MutationObserver(() => {
      document.querySelectorAll<HTMLElement>("[data-lens]").forEach((el) => delete el.dataset.lensKey);
      run();
    });
    rootMo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme-style", "data-theme", "class"] });
    const mq = window.matchMedia("(prefers-reduced-transparency: reduce)");
    mq.addEventListener("change", run);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
      rootMo.disconnect();
      mq.removeEventListener("change", run);
      document.querySelectorAll<HTMLElement>("[data-lens]").forEach(clearLens);
      svg.remove();
    };
  }, []);
  return null;
}
