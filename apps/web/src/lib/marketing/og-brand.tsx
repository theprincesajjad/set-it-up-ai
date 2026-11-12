/**
 * The share card every public page uses (the preview in WhatsApp, iMessage, Instagram, Slack): the marketing site's identity, drawn in
 * code. White paper, near-black type, the black tile with one earned stamp (the header's mark), the name as written, the headline in
 * Strata with its one Newsreader italic phrase, and one quiet line in Halden. Colours come from the marketing tokens.
 *
 * The three faces are static instances cut from the site's own web fonts (the card renderer reads TTF, not WOFF2, and no variable
 * axes): public/marketing/fonts/og/strata-850.ttf, newsreader-italic.ttf and halden-500.ttf (same licences as their sources, beside
 * them). If they cannot be read the card still renders, in the renderer's default face.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { ReactNode } from "react";
import { marketingColors as marketing } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";

export const OG_SIZE = { width: 1200, height: 630 } as const;

const FACES = [
  { name: "Strata", file: "strata-850.ttf", weight: 800, style: "normal" },
  { name: "Newsreader", file: "newsreader-italic.ttf", weight: 400, style: "italic" },
  { name: "Halden", file: "halden-500.ttf", weight: 500, style: "normal" },
] as const;

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 500 | 800; style: "normal" | "italic" };

let cached: Promise<OgFont[]> | null = null;

/** The three faces, read once. Missing files are skipped (the card falls back to the default face for that text). */
export function brandOgFonts(): Promise<OgFont[]> {
  cached ??= (async () => {
    const out: OgFont[] = [];
    for (const face of FACES) {
      for (const base of [process.cwd(), join(process.cwd(), "apps/web")]) {
        try {
          const buf = await readFile(join(base, "public/marketing/fonts/og", face.file));
          out.push({ name: face.name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight: face.weight, style: face.style });
          break;
        } catch {
          /* try the next base */
        }
      }
    }
    return out;
  })();
  return cached;
}

const INK = marketing.black;
const PAPER = marketing.paper;

/** The header's mark: a near-black rounded tile holding one earned stamp (components/marketing/landing/Wordmark.tsx). */
function Mark({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <rect x="0" y="0" width="32" height="32" rx="8" fill={INK} />
      <circle cx="16" cy="16" r="8.5" fill="none" stroke={PAPER} strokeWidth="2.5" />
      <circle cx="16" cy="16" r="3.5" fill={PAPER} />
    </svg>
  );
}

/** `*words*` in a headline is the italic phrase, as on the page (lib/marketing/emphasis.tsx). */
function headline(text: string, size: number): ReactNode {
  return text
    .split(/(\*[^*]+\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith("*") ? (
        <span key={i} style={{ fontFamily: "Newsreader", fontStyle: "italic", fontWeight: 400, fontSize: Math.round(size * 0.9), letterSpacing: -size * 0.03, marginLeft: size * 0.16 }}>
          {part.slice(1, -1)}
        </span>
      ) : (
        <span key={i}>{part.trim()}</span>
      ),
    );
}

export interface BrandCard {
  /** A small line above the headline (the audience, on the trade pages). */
  kicker?: string;
  /** The headline; `*words*` marks its italic phrase. */
  title: string;
  /** The quiet line under it. */
  foot: string;
}

/** One 1200 by 630 card. The headline steps down a size when it is long, so two lines always fit. */
export async function brandOgImage({ kicker, title, foot }: BrandCard) {
  const fonts = await brandOgFonts();
  const plain = title.replace(/\*/g, "");
  const size = plain.length <= 28 ? 132 : plain.length <= 44 ? 108 : 88;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: PAPER, color: INK, padding: "64px 72px", fontFamily: "Halden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Mark size={60} />
          <div style={{ display: "flex", fontSize: 38, fontWeight: 500, letterSpacing: -0.8 }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {kicker ? <div style={{ display: "flex", fontSize: 30, fontWeight: 500, color: marketing.body, marginBottom: 14 }}>{kicker}</div> : null}
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", fontFamily: "Strata", fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: -size * 0.012 }}>{headline(title, size)}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "2px solid #E0E0E0", paddingTop: 26, fontSize: 30, fontWeight: 500, color: marketing.body }}>
          <div style={{ display: "flex" }}>{foot}</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts },
  );
}
