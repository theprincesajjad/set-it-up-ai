/**
 * The home page's "try it" card maker (wave V): the trades it offers, each trade's real starting card and the colours to pick from.
 * Built on the server from the same data signup uses, so what the owner sees here is what the signup's card step starts with:
 *
 *   - the reward and the goal come from VERTICAL_TEMPLATES (@ll/shared), through `cardFor` in the signup draft (stamps for cafés,
 *     bakeries, barbers and nail studios; points for repair shops, corner stores, florists and groomers);
 *   - the colours are the trade palette signup's colour field offers (tradeFamilies), each resolved and contrast-checked by
 *     `resolveShopColors` (@ll/design-tokens), so the pass text reads on every one.
 *
 * Only plain data crosses to the client island (components/marketing/landing/TryCard.tsx): no templates, no colour maths in its bundle.
 * The hand-off link is built in ./try-href.ts (client-safe): /signup?shop=&vertical=&color=&src=home-try, read by ./signupPrefill.ts.
 */
import { resolveShopColors, tradeFamilies } from "@ll/design-tokens";
import { cardFor } from "@/components/onboarding/signup/draft";

/** The trades on the picker, in order: shop label, the vertical signup stores, and the icon the stamps use. */
export const TRY_TRADES = [
  { key: "cafe", vertical: "cafe", icon: "coffee" },
  { key: "bakery", vertical: "bakery", icon: "croissant" },
  { key: "barber", vertical: "barber", icon: "scissors" },
  { key: "nails", vertical: "nails", icon: "sparkles" },
  { key: "repair", vertical: "repair_electronics", icon: "phone" },
  { key: "corner", vertical: "grocery", icon: "basket" },
  { key: "florist", vertical: "florist", icon: "flower" },
  { key: "pet", vertical: "pet", icon: "paw" },
] as const;

export type TryTradeKey = (typeof TRY_TRADES)[number]["key"];
export type TryIcon = (typeof TRY_TRADES)[number]["icon"];

/** The colours on offer after the trade's own: a few of the trade palette, so the owner sees the card change and signup's field shows the pick. */
const EXTRA_SWATCHES = [tradeFamilies.slate.accent, tradeFamilies.leaf.accent, tradeFamilies.plum.accent, tradeFamilies.terracotta.accent, tradeFamilies.teal.accent, tradeFamilies.barber.accent];

export interface TryColour {
  /** "#RRGGBB" as the owner picks it (what signup stores). */
  base: string;
  /** The pass fill and the text on it, AA-checked. */
  fill: string;
  ink: string;
}

export interface TryTrade {
  key: TryTradeKey;
  vertical: string;
  icon: TryIcon;
  /** "stamps" draws a stamp strip; "points" a points bar (the template's earn type). */
  kind: "stamps" | "points";
  goal: number;
  reward: string;
  /** Points per dollar on a points card (0 on stamps). */
  rate: number;
  /** The trade's own colour, first on the colour row. */
  colour: TryColour;
}

const colourOf = (base: string | null, vertical: string): TryColour => {
  const c = resolveShopColors(base, vertical);
  return { base: c.base.toUpperCase(), fill: c.light.accent, ink: c.light.foreground };
};

export function tryTrades(): TryTrade[] {
  return TRY_TRADES.map((t) => {
    const card = cardFor(t.vertical, null);
    return { key: t.key, vertical: t.vertical, icon: t.icon, kind: card.earnType === "stamps" ? "stamps" : "points", goal: card.goal, reward: card.reward, rate: card.rate, colour: colourOf(null, t.vertical) };
  });
}

/** The extra colours, resolved once against a neutral trade (the brand colour wins, so the vertical only matters for the fallback). */
export function tryColours(): TryColour[] {
  return EXTRA_SWATCHES.map((hex) => colourOf(hex, "other"));
}
