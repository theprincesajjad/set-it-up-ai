import { ImageResponse } from "next/og";
import { rolesV3 } from "@ll/design-tokens";
import { BRAND, en } from "@ll/shared";
import { ogFonts } from "@/lib/og";

export const SOLO_OG_SIZE = { width: 1200, height: 630 } as const;

type Page = "nail" | "barber" | "groom";
const TITLE = { nail: en["mkt.solo.nail.title"], barber: en["mkt.solo.barber.title"], groom: en["mkt.solo.groom.title"] } as const;
const KICKER = { nail: en["mkt.solo.nail.eyebrow"], barber: en["mkt.solo.barber.eyebrow"], groom: en["mkt.solo.groom.eyebrow"] } as const;
const CTA = { nail: en["mkt.solo.nail.cta"], barber: en["mkt.solo.barber.cta"], groom: en["mkt.solo.groom.cta"] } as const;

/** One social card per landing page: flat paper, the headline in the display face, the call to action. No gradient, no photo. Literal colours come from the light v3 roles. */
export async function soloOgImage(page: Page) {
  const bg = rolesV3.light.background;
  const ink = rolesV3.light.foreground;
  const fonts = await ogFonts();
  const display = fonts.length ? "Bricolage Grotesque" : undefined; // l10n-ok: font family name
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: bg, padding: 72, color: ink }}>
        <div style={{ display: "flex", fontSize: 32, fontWeight: 700, color: "#6B6B70" }}>{KICKER[page]}</div>
        <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.04, letterSpacing: -1.5, fontFamily: display }}>{TITLE[page]}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 30 }}>
          <div style={{ display: "flex", padding: "16px 32px", borderRadius: 999, background: ink, color: bg, fontWeight: 700 }}>{CTA[page]}</div>
          <div style={{ display: "flex", color: "#6B6B70" }}>{BRAND.name}</div>
        </div>
      </div>
    ),
    { ...SOLO_OG_SIZE, fonts },
  );
}
