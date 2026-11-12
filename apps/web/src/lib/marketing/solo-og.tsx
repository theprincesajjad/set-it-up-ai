import { BRAND } from "@ll/shared";
import { LANDING_VARIANTS } from "@/copy/en-CA";
import { OG_SIZE, brandOgImage } from "./og-brand";

export const SOLO_OG_SIZE = OG_SIZE;

export const SOLO_OG_PAGES = ["nail", "barber", "groom"] as const;
export type SoloOgPage = (typeof SOLO_OG_PAGES)[number];

const V = { nail: LANDING_VARIANTS.nails.control, barber: LANDING_VARIANTS.barber.control, groom: LANDING_VARIANTS.groom.control };

/** Where each trade page's share card is served (app/og/solo/[page]/route.ts): outside the page folders, whose [variant] routes and A/B rewrite swallowed a card placed beside the page. */
export const soloOgPath = (page: SoloOgPage) => `/og/solo/${page}`;

/**
 * The `openGraph` and `twitter` blocks for a trade page: its own card, plus the site name, type and locale the root layout sets (a
 * page-level `openGraph` replaces the root's, it does not merge). Spread into the page's metadata.
 */
export function soloSocial(page: SoloOgPage, { title, description, path }: { title: string; description: string; path: string }) {
  const images = [{ url: soloOgPath(page), ...OG_SIZE, alt: title, type: "image/png" }];
  return {
    openGraph: { type: "website" as const, siteName: BRAND.name, locale: "en_CA", url: path, title, description, images },
    twitter: { card: "summary_large_image" as const, title, description, images },
  };
}

/** The trade pages' promise in five words (PLAN_COPY.priceLine: "Free to start ... No credit card."). */
const SOLO_FOOT = "Free to start · No credit card";

/** One share card per trade page: the page's control headline in the site's identity, the audience above it, the promise under it. */
export function soloOgImage(page: SoloOgPage) {
  const v = V[page];
  return brandOgImage({ kicker: v.eyebrow, title: v.hook.join(" "), foot: SOLO_FOOT });
}
