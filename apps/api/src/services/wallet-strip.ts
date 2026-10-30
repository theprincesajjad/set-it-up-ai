/**
 * The shop card's front image, drawn without an image library (pure signed-distance shapes, anti-aliased, encoded by
 * wallet-png.ts). Apple: `strip.png` behind the store card's primary fields, 375×123 pt (750×246 @2x, 1125×369 @3x;
 * PassKit Pass Design and Creation). Google: the loyalty object's `heroImage` (served from /v1/wallet/strip.png).
 *
 *  - stamps (goal ≤ STRIP_MAX_STAMPS): one row of circles (two rows above 6). Filled = a solid disc with a check, empty =
 *    a ring, the last one (the reward) = a double ring.
 *  - points, or a bigger goal: a rounded progress bar towards the next reward.
 *
 * Only counts and colours go in: no name, no member data, so the public URL is safe to cache.
 */
import { walletApi } from "@ll/shared";
import { encodePng, hexToRgb, type Rgba } from "./wallet-png.js";

export const STRIP_PT = { width: 375, height: 123 } as const;

export interface StripInput {
  kind: "stamps" | "points";
  filled: number;
  goal: number;
  background: string;
  foreground: string;
}

/** Normalise untrusted query input (public endpoint) into a bounded StripInput. */
export function stripInputFrom(q: { k?: string; n?: string | number; g?: string | number; bg?: string; fg?: string }): StripInput {
  const hex = (v: string | undefined, d: string) => (v && /^[0-9a-fA-F]{6}$/.test(v) ? `#${v}` : d);
  const goal = Math.max(0, Math.min(10_000, Math.floor(Number(q.g) || 0)));
  return {
    kind: q.k === "points" ? "points" : "stamps",
    goal,
    filled: Math.max(0, Math.min(goal, Math.floor(Number(q.n) || 0))),
    background: hex(q.bg, "#0B0B0C"),
    foreground: hex(q.fg, "#FFFFFF"),
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Distance from p to the segment ab. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const t = clamp01(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

interface Cell {
  cx: number;
  cy: number;
  filled: boolean;
  reward: boolean;
}

/** Circle centres and radius for a stamp grid in a w×h box. */
export function stampLayout(goal: number, filled: number, w: number, h: number): { r: number; cells: Cell[]; rows: number; perRow: number } {
  const rows = goal > 6 ? 2 : 1;
  const perRow = Math.ceil(goal / rows);
  const padX = w * 0.06;
  const padY = h * 0.14;
  const pitchX = (w - 2 * padX) / perRow;
  const pitchY = (h - 2 * padY) / rows;
  const r = Math.min(pitchX, pitchY) * 0.4;
  const cells: Cell[] = [];
  for (let i = 0; i < goal; i++) {
    const row = Math.floor(i / perRow);
    const inRow = row === rows - 1 ? goal - perRow * (rows - 1) : perRow;
    const col = i - row * perRow;
    // Centre each row (the last row may be shorter).
    const rowWidth = inRow * pitchX;
    const x0 = (w - rowWidth) / 2;
    cells.push({ cx: x0 + pitchX * (col + 0.5), cy: padY + pitchY * (row + 0.5), filled: i < filled, reward: i === goal - 1 });
  }
  return { r, cells, rows, perRow };
}

/** Render the strip at a scale (1, 2 or 3). */
export function renderStrip(input: StripInput, scale = 2): Buffer {
  const w = STRIP_PT.width * scale;
  const h = STRIP_PT.height * scale;
  const [br, bg, bb] = hexToRgb(input.background);
  const [fr, fg, fb] = hexToRgb(input.foreground);
  const over = (base: [number, number, number], col: [number, number, number], a: number): [number, number, number] => [base[0] + (col[0] - base[0]) * a, base[1] + (col[1] - base[1]) * a, base[2] + (col[2] - base[2]) * a];
  const B: [number, number, number] = [br, bg, bb];
  const F: [number, number, number] = [fr, fg, fb];
  const px = (c: [number, number, number]): Rgba => [Math.round(c[0]), Math.round(c[1]), Math.round(c[2]), 255];
  const goal = input.goal;
  const useStamps = input.kind === "stamps" && goal > 0 && goal <= walletApi.STRIP_MAX_STAMPS;

  if (useStamps) {
    const { r, cells, rows, perRow } = stampLayout(goal, input.filled, w, h);
    const ring = Math.max(1.5, r * 0.11);
    const padY = h * 0.14;
    const pitchY = (h - 2 * padY) / rows;
    return encodePng(w, h, (x, y) => {
      // The nearest cell: its row from y, then the nearest centre in that row.
      const row = Math.max(0, Math.min(rows - 1, Math.floor((y - padY) / pitchY)));
      let best: Cell | undefined;
      let bd = Infinity;
      for (let i = row * perRow; i < Math.min(goal, (row + 1) * perRow); i++) {
        const c = cells[i]!;
        const d = Math.abs(c.cx - x);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best) return px(B);
      const d = Math.hypot(x + 0.5 - best.cx, y + 0.5 - best.cy);
      if (d > r + 1) return px(B);
      if (best.filled) {
        const disc = clamp01(r - d + 0.5);
        let col = over(B, F, disc);
        // The check, in the card colour, inside the disc.
        const s = r * 0.42;
        const dc = Math.min(segDist(x + 0.5, y + 0.5, best.cx - s * 0.95, best.cy + s * 0.05, best.cx - s * 0.25, best.cy + s * 0.7), segDist(x + 0.5, y + 0.5, best.cx - s * 0.25, best.cy + s * 0.7, best.cx + s, best.cy - s * 0.6));
        const check = clamp01(r * 0.1 - dc + 0.5) * disc;
        col = over(col, B, check);
        return px(col);
      }
      // Empty: a ring (softer), the reward cell a double ring.
      let a = clamp01(ring / 2 - Math.abs(d - (r - ring / 2)) + 0.5) * 0.55;
      if (best.reward) a = Math.max(a, clamp01(ring / 2 - Math.abs(d - r * 0.62) + 0.5) * 0.9, clamp01(r * 0.16 - d + 0.5) * 0.9);
      return px(over(B, F, a));
    });
  }

  // Progress bar (points, or a stamp goal too big for circles). Nothing set up yet: an empty track.
  const frac = goal > 0 ? clamp01(input.filled / goal) : 0;
  const barH = h * 0.18;
  const x0 = w * 0.08;
  const x1 = w * 0.92;
  const cy = h * 0.5;
  const rad = barH / 2;
  const fillEnd = x0 + (x1 - x0) * frac;
  return encodePng(w, h, (x, y) => {
    const X = x + 0.5;
    const Y = y + 0.5;
    const track = clamp01(rad - segDist(X, Y, x0 + rad, cy, x1 - rad, cy) + 0.5);
    if (track <= 0) return px(B);
    let col = over(B, F, track * 0.25);
    if (frac > 0) {
      const end = Math.max(x0 + rad, fillEnd - rad);
      const fill = clamp01(rad - segDist(X, Y, x0 + rad, cy, end, cy) + 0.5);
      col = over(col, F, fill);
    }
    return px(col);
  });
}

/** Apple's three resolutions. */
export function stripImages(input: StripInput): Record<string, Buffer> {
  return { "strip.png": renderStrip(input, 1), "strip@2x.png": renderStrip(input, 2), "strip@3x.png": renderStrip(input, 3) };
}

/** Query string for the public strip URL (Google heroImage); changes whenever the picture does, so Google refetches. */
export function stripQuery(input: StripInput): string {
  return new URLSearchParams({ k: input.kind, n: String(input.filled), g: String(input.goal), bg: input.background.slice(1), fg: input.foreground.slice(1) }).toString();
}
