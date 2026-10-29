/**
 * Authoring engine for the 3D icon set (docs/design/onboarding-v1.md section 6).
 *
 * The 3D comes from form: every object is built from a handful of primitives (rounded slab, cylinder, sphere, flat plate) projected with one
 * fixed three-quarter view, lit from the top-left, and shaded with exactly three flat tones per material (lit, mid, shade). There are no
 * gradients and no filters anywhere: hard edges between faces, one soft contact shadow made of three stacked ellipses.
 *
 * World: x runs to the right and away, y to the left and away, z is up. The camera is rotated by YAW about the vertical and tilted by PITCH.
 * A box therefore shows its top (lit), its wide front face (mid, turned toward the light) and a narrow right face (shade).
 *
 * Output: an SVG whose fills are CSS classes (n1..n3 neutral, a1..a3 accent, ik ink, on mark-on-accent, w white), each with a fallback colour,
 * so one file serves every trade colour and both themes (see icons3d.css) and still renders alone in an <img>, an email or an OG card.
 */

const D2R = Math.PI / 180;
export const YAW = -24; // degrees: a wide front face turned slightly toward the light, a narrow face on the right
export const PITCH = 22; // degrees of tilt: how much of the top face shows

const cyaw = Math.cos(YAW * D2R);
const syaw = Math.sin(YAW * D2R);
const cp = Math.cos(PITCH * D2R);
const sp = Math.sin(PITCH * D2R);

/** World to screen (unscaled, y down). */
export function proj(x, y, z) {
  const xr = x * cyaw - y * syaw;
  const yr = x * syaw + y * cyaw;
  return [xr, -z * cp - yr * sp];
}
/** Depth of a point (bigger is farther from the camera). */
export const depth = (x, y) => x * syaw + y * cyaw;

const r2 = (n) => Math.round(n * 100) / 100;
const fmt = (n) => String(r2(n)).replace(/^-0$/, "0");

// --- geometry helpers (screen space) --------------------------------------------------------------------------------------------

function hull(points) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [];
  for (const p of pts) {
    while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop();
    lo.push(p);
  }
  const up = [];
  for (const p of [...pts].reverse()) {
    while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop();
    up.push(p);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** Closed polygon with rounded corners; `r` is a number or one radius per vertex (0 keeps a corner sharp). Commands, not a string, so the fit can transform them. */
function roundedPoly(pts, r) {
  const n = pts.length;
  const cmds = [];
  const radii = (i) => (Array.isArray(r) ? r[i] : r);
  const corner = (i) => {
    const p = pts[i];
    const a = pts[(i + n - 1) % n];
    const b = pts[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]);
    const lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(radii(i), la / 2, lb / 2);
    if (rr <= 0.001) return { p, in: p, out: p, sharp: true };
    return { p, in: [p[0] + ((a[0] - p[0]) / la) * rr, p[1] + ((a[1] - p[1]) / la) * rr], out: [p[0] + ((b[0] - p[0]) / lb) * rr, p[1] + ((b[1] - p[1]) / lb) * rr], sharp: false };
  };
  const cs = pts.map((_, i) => corner(i));
  cmds.push(["M", ...cs[0].out]);
  for (let k = 1; k <= n; k++) {
    const c = cs[k % n];
    cmds.push(["L", ...c.in]);
    if (!c.sharp) cmds.push(["Q", ...c.p, ...c.out]);
  }
  cmds.push(["Z"]);
  return cmds;
}

const signedArea = (pts) => pts.reduce((s, p, i) => {
  const q = pts[(i + 1) % pts.length];
  return s + (p[0] * q[1] - q[0] * p[1]);
}, 0) / 2;

// --- the scene ---------------------------------------------------------------------------------------------------------------------

const FALLBACK = {
  n1: "#F2F2F7", n2: "#D2D2D7", n3: "#AEAEB4",
  ik: "#1D1D1F", on: "#FFFFFF", w: "#FFFFFF",
};
function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mixHex(a, b, pctB) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  const c = A.map((v, i) => Math.round(v * (1 - pctB) + B[i] * pctB));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
}
export const SKY = "#2873B0";
FALLBACK.a1 = SKY;
FALLBACK.a2 = mixHex(SKY, FALLBACK.ik, 0.18);
FALLBACK.a3 = mixHex(SKY, FALLBACK.ik, 0.36);
export const FALLBACKS = FALLBACK;

/** Materials: three tones each. `lit` for the top, `mid` for the lit side, `shade` for the dark side. */
export const N = { lit: "n1", mid: "n2", shade: "n3" }; // neutral body
export const A = { lit: "a1", mid: "a2", shade: "a3" }; // the trade accent
export const INK = { lit: "ik", mid: "ik", shade: "ik" };
export const ON = { lit: "on", mid: "on", shade: "on" }; // marks on an accent face (white in light, deep brown in dark)
export const WHITE = { lit: "w", mid: "w", shade: "w" };

export class Scene {
  constructor() {
    this.items = []; // { kind: 'shape', cmds, cls, stroke? } in screen space
    this.shadows = [];
  }

  // -- low level --------------------------------------------------------------------------------------------------------------------
  _shape(cmds, cls, extra = {}) {
    this.items.push({ cmds, cls, ...extra });
  }
  /** A screen-space polygon from world points, rounded. */
  poly3(points3, cls, r = 0) {
    const pts = points3.map(([x, y, z]) => proj(x, y, z));
    this._shape(roundedPoly(pts, r), cls);
  }
  /** A polygon in screen coordinates already (used by hand-built details). */
  polyS(pts, cls, r = 0) {
    this._shape(roundedPoly(pts, r), cls);
  }
  /** Ellipse in screen space. */
  ellipseS(cx, cy, rx, ry, cls) {
    this._shape([["M", cx - rx, cy], ["A", rx, ry, 0, 1, 0, cx + rx, cy], ["A", rx, ry, 0, 1, 0, cx - rx, cy], ["Z"]], cls);
  }
  /** A circle lying in the plane through `c` spanned by the unit axes `u` and `v` (world), radius R. Affine image of a circle: exact. */
  circle3(c, u, v, R, cls) {
    const O = proj(...c);
    const U = proj(c[0] + u[0] * R, c[1] + u[1] * R, c[2] + u[2] * R).map((q, i) => q - O[i]);
    const V = proj(c[0] + v[0] * R, c[1] + v[1] * R, c[2] + v[2] * R).map((q, i) => q - O[i]);
    const k = 0.5522847498;
    const P = (a, b) => [O[0] + U[0] * a + V[0] * b, O[1] + U[1] * a + V[1] * b];
    const cmds = [["M", ...P(1, 0)]];
    const seg = (a1, b1, a2, b2, a3, b3) => cmds.push(["C", ...P(a1, b1), ...P(a2, b2), ...P(a3, b3)]);
    seg(1, k, k, 1, 0, 1);
    seg(-k, 1, -1, k, -1, 0);
    seg(-1, -k, -k, -1, 0, -1);
    seg(k, -1, 1, -k, 1, 0);
    cmds.push(["Z"]);
    this._shape(cmds, cls);
  }
  /** Circle on the horizontal plane at height z. */
  disc(cx, cy, z, R, cls) {
    this.circle3([cx, cy, z], [1, 0, 0], [0, 1, 0], R, cls);
  }
  /** A thin line (the only stroked thing in the set): ink marks, cords, a nail's edge. Width in world units. */
  line3(points3, cls, width) {
    const pts = points3.map(([x, y, z]) => proj(x, y, z));
    this._shape(pts.map((p, i) => [i ? "L" : "M", ...p]), cls, { stroke: width });
  }

  // -- primitives -------------------------------------------------------------------------------------------------------------------
  /** Rounded slab. Min corner (x, y, z), size w (x), d (y), h (z). */
  box(x, y, z, w, d, h, m = N, r = 1) {
    const X = x + w, Y = y + d, Z = z + h;
    const c = (a, b, e) => [a, b, e];
    // front (low y, facing -y), left (low x, facing -x), right (high x, facing +x), top
    const front = [c(x, y, z), c(X, y, z), c(X, y, Z), c(x, y, Z)];
    const right = [c(X, y, z), c(X, Y, z), c(X, Y, Z), c(X, y, Z)];
    const left = [c(x, Y, z), c(x, y, z), c(x, y, Z), c(x, Y, Z)];
    const top = [c(x, y, Z), c(X, y, Z), c(X, Y, Z), c(x, Y, Z)];
    const all = [...front, ...right, ...left, ...top].map(([a, b, e]) => proj(a, b, e));
    // Silhouette in the dark tone, so no seam ever shows the background.
    this._shape(roundedPoly(hull(all), r), m.shade);
    const sideTone = (poly) => poly.map(([a, b, e]) => proj(a, b, e));
    const fPts = sideTone(front);
    const rPts = sideTone(right);
    // YAW < 0: the front face is turned to the left; the visible narrow side is the +x one on the right.
    if (YAW < 0) {
      this._shape(roundedPoly(rPts, [0, r, r, 0]), m.shade);
      this._shape(roundedPoly(fPts, [r, 0, 0, r]), m.mid);
    } else {
      const lp = sideTone(left);
      this._shape(roundedPoly(lp, [r, 0, 0, r]), m.mid);
      this._shape(roundedPoly(fPts, [0, r, r, 0]), m.shade);
    }
    this._shape(roundedPoly(top.map(([a, b, e]) => proj(a, b, e)), r), m.lit);
  }

  /** Vertical cylinder. Centre (cx, cy), base z, radius R, height h. `tops`: tone of the top (default lit). Returns nothing. */
  cyl(cx, cy, z, R, h, m = N, { top = true, split = 0.42 } = {}) {
    const [ox, oy] = proj(cx, cy, z);
    const ry = R * sp;
    const yT = oy - h * cp;
    // body: base tone `mid`, right slice `shade`
    const body = [["M", ox - R, yT], ["L", ox - R, oy], ["A", R, ry, 0, 0, 0, ox + R, oy], ["L", ox + R, yT], ["Z"]];
    this._shape(body, m.mid);
    // shade slice: x from ox + R*(1 - 2*split)... to ox + R
    const sx = ox + R * (1 - 2 * split);
    const dy = ry * Math.sqrt(Math.max(0, 1 - ((sx - ox) / R) ** 2));
    this._shape([["M", sx, yT], ["L", sx, oy + dy], ["A", R, ry, 0, 0, 0, ox + R, oy], ["L", ox + R, yT], ["Z"]], m.shade);
    if (top) this.ellipseS(ox, yT, R, ry, m.lit);
    return { ox, oy, yT, ry, R };
  }

  /** A sphere of radius R, centre (cx, cy, cz). Three flat tones by stacked circles, all inside the silhouette. */
  sphere(cx, cy, cz, R, m = N) {
    const [ox, oy] = proj(cx, cy, cz);
    this.ellipseS(ox, oy, R, R, m.shade);
    const o1 = R * 0.1 * Math.SQRT1_2;
    this.ellipseS(ox - o1, oy - o1, R * 0.9, R * 0.9, m.mid);
    const o2 = R * 0.28 * Math.SQRT1_2;
    this.ellipseS(ox - o2, oy - o2, R * 0.72, R * 0.72, m.lit);
  }

  /** Extruded 2D footprint (world x, y points, counter-clockwise seen from above). Convex footprints only. */
  prism(foot, z, h, m = N, r = 0.8) {
    const bot = foot.map(([a, b]) => proj(a, b, z));
    const topP = foot.map(([a, b]) => proj(a, b, z + h));
    this._shape(roundedPoly(hull([...bot, ...topP]), r), m.shade);
    const n = foot.length;
    for (let i = 0; i < n; i++) {
      const p = foot[i];
      const q = foot[(i + 1) % n];
      // outward normal of the edge (footprint is CCW from above: outward = (dy, -dx))
      const nx = q[1] - p[1];
      const ny = -(q[0] - p[0]);
      // view direction toward the camera is -(syaw, cyaw) in (x, y): a face is visible when its normal points that way
      const vis = nx * -syaw + ny * -cyaw;
      if (vis <= 0.001) continue;
      const nrm = Math.hypot(nx, ny) || 1;
      const sxN = (nx * cyaw - ny * syaw) / nrm; // screen-x of the normal
      const tone = sxN < 0.12 ? m.mid : m.shade;
      const quad = [proj(p[0], p[1], z), proj(q[0], q[1], z), proj(q[0], q[1], z + h), proj(p[0], p[1], z + h)];
      if (tone !== m.shade) this._shape(roundedPoly(quad, 0), tone);
    }
    this._shape(roundedPoly(topP, r), m.lit);
  }

  /** Contact shadow under a footprint, in world coordinates: an ellipse of screen radii rx, ry around the projected point. */
  shadow(cx, cy, rx, ry) {
    const [ox, oy] = proj(cx, cy, 0);
    this.shadows.push({ ox, oy, rx, ry });
  }

  // -- output -----------------------------------------------------------------------------------------------------------------------
  _bounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = (x, y, pad = 0) => {
      x0 = Math.min(x0, x - pad); x1 = Math.max(x1, x + pad);
      y0 = Math.min(y0, y - pad); y1 = Math.max(y1, y + pad);
    };
    for (const it of this.items) {
      let cur = [0, 0];
      const pad = it.stroke ? it.stroke / 2 : 0;
      for (const c of it.cmds) {
        const k = c[0];
        if (k === "M" || k === "L") { add(c[1], c[2], pad); cur = [c[1], c[2]]; }
        else if (k === "Q") { add(c[3], c[4], pad); cur = [c[3], c[4]]; }
        else if (k === "C") { add(c[1], c[2]); add(c[3], c[4]); add(c[5], c[6]); cur = [c[5], c[6]]; }
        else if (k === "A") {
          // endpoints plus the ellipse's own extent about the chord midpoint
          const mx = (cur[0] + c[6]) / 2, my = (cur[1] + c[7]) / 2;
          add(cur[0], cur[1]); add(c[6], c[7]);
          if (c[1] === c[2]) add(mx, my, 0); // circle halves: handled by neighbours
          // ellipse centre equals chord midpoint for the half-ellipses we emit
          add(mx - c[1], my); add(mx + c[1], my); add(mx, my - c[2]); add(mx, my + c[2]);
          cur = [c[6], c[7]];
        }
      }
    }
    for (const s of this.shadows) { add(s.ox - s.rx, s.oy); add(s.ox + s.rx, s.oy); add(s.ox, s.oy - s.ry); add(s.ox, s.oy + s.ry); }
    return { x0, y0, x1, y1 };
  }

  /** Fit into a rectangle of the viewBox and return the SVG markup (a <svg> string). */
  toSvg({ vbw = 48, vbh = 48, box = [6, 6, 42, 42], title } = {}) {
    const b = this._bounds();
    const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
    const [bx0, by0, bx1, by1] = box;
    const k = Math.min((bx1 - bx0) / bw, (by1 - by0) / bh);
    const tx = (bx0 + bx1) / 2 - ((b.x0 + b.x1) / 2) * k;
    const ty = (by0 + by1) / 2 - ((b.y0 + b.y1) / 2) * k;
    const X = (v) => fmt(v * k + tx);
    const Y = (v) => fmt(v * k + ty);
    const d = (cmds) => cmds.map((c) => {
      switch (c[0]) {
        case "M": case "L": return `${c[0]}${X(c[1])} ${Y(c[2])}`;
        case "Q": return `Q${X(c[1])} ${Y(c[2])} ${X(c[3])} ${Y(c[4])}`;
        case "C": return `C${X(c[1])} ${Y(c[2])} ${X(c[3])} ${Y(c[4])} ${X(c[5])} ${Y(c[6])}`;
        case "A": return `A${fmt(c[1] * k)} ${fmt(c[2] * k)} 0 ${c[4]} ${c[5]} ${X(c[6])} ${Y(c[7])}`;
        default: return "Z";
      }
    }).join("");
    const out = [];
    // One contact shadow: three stacked ellipses stand in for the 2 px blur (a filter is not allowed), offset 1.5 down-right.
    const off = 1.5;
    for (const s of this.shadows) {
      const cx = fmt(s.ox * k + tx + off), cy = fmt(s.oy * k + ty + off);
      const rx = s.rx * k, ry = s.ry * k;
      out.push(`<g class="sh">`);
      [[1.06, 1.12], [0.94, 0.94], [0.8, 0.74]].forEach(([fx, fy]) => out.push(`<ellipse cx="${cx}" cy="${cy}" rx="${fmt(rx * fx)}" ry="${fmt(ry * fy)}"/>`));
      out.push(`</g>`);
    }
    for (const it of this.items) {
      if (it.stroke) out.push(`<path class="s ${it.cls}" stroke-width="${fmt(it.stroke * k)}" d="${d(it.cmds)}"/>`);
      else out.push(`<path class="${it.cls}" d="${d(it.cmds)}"/>`);
    }
    const t = title ? `` : ``;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbw} ${vbh}" fill="none"><style>${CSS}</style>${t}${out.join("")}</svg>`;
  }
}

export const CSS = [
  ...Object.keys(FALLBACK).map((k) => `.${k}{fill:var(--i3d-${k},${FALLBACK[k]})}`),
  `.sh ellipse{fill:var(--i3d-sh,#1D1D1F);fill-opacity:var(--i3d-so,.028)}`,
  `.s{fill:none;stroke-linecap:round;stroke-linejoin:round}.s.ik{stroke:var(--i3d-ik,#1D1D1F)}.s.w{stroke:var(--i3d-w,#FFFFFF)}.s.n3{stroke:var(--i3d-n3,#AEAEB4)}.s.n2{stroke:var(--i3d-n2,#D2D2D7)}.s.a3{stroke:var(--i3d-a3,${FALLBACK.a3})}.s.a2{stroke:var(--i3d-a2,${FALLBACK.a2})}`,
].join("");
