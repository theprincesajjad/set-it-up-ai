import { ImageResponse } from "next/og";
import { rolesV3 } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";
import { publicServerApi } from "@/lib/api/server";
import { ogFonts } from "@/lib/og";
import { onColor, shopInitials } from "@/lib/shopAvatar";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Earn rewards at this shop"; // l10n-ok: social-card image is rendered once for crawlers; it has no Indic fonts or request language

/** Shop social card (v2): "Earn rewards at {Shop}" on white; the shop's own colour only in its avatar. */
export default async function ShopOg({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let name = "a local shop";
  // ImageResponse takes literal colours: the light v3 roles, read from the tokens.
  const tint = rolesV3.light.background;
  const ink = rolesV3.light.foreground;
  let brand: string = rolesV3.light.foreground;
  let logo: string | null = null;
  let where = "";
  try {
    const s = await publicServerApi().public.shop(slug);
    name = s.merchant.name;
    brand = s.merchant.brandColor ?? brand;
    logo = s.merchant.logoUrl;
    where = s.merchant.neighbourhood?.name ?? "";
  } catch {
    /* generic card */
  }
  const fonts = await ogFonts();
  const display = fonts.length ? "Bricolage Grotesque" : undefined; // l10n-ok: font family name
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: tint, padding: 72, color: ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {logo ? (
            <img src={logo} width={120} height={120} style={{ borderRadius: 60 }} alt="" />
          ) : (
            // Lowercase initials on the shop's colour, the same avatar as the app and the pass.
            <div style={{ width: 120, height: 120, borderRadius: 60, background: brand, color: onColor(brand), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 46, fontWeight: 800, fontFamily: display }}>
              {shopInitials(name).toLowerCase()}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 52, fontWeight: 700, display: "flex" }}>{name}</div>
            {where ? <div style={{ fontSize: 32, color: "#6B6B70", fontStyle: "italic" }}>{where.toLowerCase()}</div> : null}
          </div>
        </div>
        <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.02, letterSpacing: -1.6, fontFamily: display, display: "flex" }}>{`earn rewards at ${name.toLowerCase()}`}</div> {/* l10n-ok: English social card (see alt) */}
        {/* l10n-ok: English social card (see alt) */}
        <div style={{ fontSize: 30, display: "flex", color: "#6B6B70" }}>Part of {BRAND.name} · No app needed · Free</div>
      </div>
    ),
    { ...size, fonts },
  );
}
