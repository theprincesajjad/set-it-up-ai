/**
 * A shop's own colour on its customer screens (server-safe). The shop's `brandColor`, else its trade colour (nails rose, café brown ...),
 * resolved and contrast-checked by `resolveShopColors` in @ll/design-tokens.
 *
 *   <div {...shopColorProps(shop)}>   sets data-trade (the trade family, for icons and Warm) and, for a brand colour, data-shop-color with
 *                                     both modes' values inline; tokens.css picks light or dark. Every `bg-trade`, `text-trade-foreground`,
 *                                     `bg-trade-soft`, `text-trade-deep` ... below it then wears the shop's colour.
 *
 * A shop without a brand colour only gets data-trade: the trade families in tokens.css are the same values, already AA-checked.
 */
import { resolveShopColors, shopColorStyle, type ShopColors } from "@ll/design-tokens";
import type { CSSProperties } from "react";

export interface ShopColorInput {
  vertical?: string | null;
  brandColor?: string | null;
}

export type ShopColorProps = { "data-trade"?: string; "data-shop-color"?: "brand"; style?: CSSProperties };

export function shopColors(shop: ShopColorInput | null | undefined): ShopColors {
  return resolveShopColors(shop?.brandColor, shop?.vertical);
}

export function shopColorProps(shop: ShopColorInput | null | undefined, style?: CSSProperties): ShopColorProps {
  if (!shop) return style ? { style } : {};
  const c = shopColors(shop);
  const trade = shop.vertical ?? undefined;
  if (c.source !== "brand") return { "data-trade": trade, ...(style ? { style } : {}) };
  return { "data-trade": trade, "data-shop-color": "brand", style: { ...(shopColorStyle(c) as CSSProperties), ...style } };
}
