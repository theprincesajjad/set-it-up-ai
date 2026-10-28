import { ImageResponse } from "next/og";
import { TILE_NAMES, rolesV3, tilePairs, warm } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";
import { ogFonts } from "@/lib/og";

export const alt = `${BRAND.name}: one card for every shop on your street`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const STRIPES = 12;
const WHITE = rolesV3.light.card;

/** Default social card (Main Street Warm): cream canvas, the terracotta awning, the mark, a serif-weight headline and a row of pastel trade tiles. */
export default async function OgImage() {
  const fonts = await ogFonts();
  const display = fonts.length ? "Bricolage Grotesque" : undefined;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: warm.cream }}>
        {/* Awning: terracotta and white stripes, rounded at the bottom, one per page. */}
        <div style={{ display: "flex", width: "100%", height: 36 }}>
          {Array.from({ length: STRIPES }, (_, i) => (
            <div key={i} style={{ flex: 1, height: 36, background: i % 2 === 0 ? warm.terracotta : WHITE, borderBottomLeftRadius: 18, borderBottomRightRadius: 18 }} />
          ))}
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "36px 72px 52px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="72" height="72" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill={warm.terracotta} />
              <circle cx="22" cy="22" r="7.5" fill={WHITE} />
              <circle cx="42" cy="22" r="7.5" fill={WHITE} />
              <circle cx="22" cy="42" r="7.5" fill={WHITE} />
              <circle cx="42" cy="42" r="7.5" fill={tilePairs.butter.fill} />
            </svg>
            <div style={{ fontSize: 40, fontWeight: 800, color: warm.ink, display: "flex", letterSpacing: -0.4, fontFamily: display }}>{BRAND.name.toLowerCase()}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", fontSize: 80, fontWeight: 800, color: warm.ink, lineHeight: 1.02, letterSpacing: -1.6, fontFamily: display }}>
              <span>one card for every shop on&nbsp;</span>
              <span style={{ color: warm.terracottaDeep }}>your street.</span>
            </div>
            <div style={{ display: "flex", fontSize: 30, color: warm.muted }}>Free forever · No fee on loyalty · Unlimited locations</div>
          </div>
          <div style={{ display: "flex", gap: 14 }}>
            {TILE_NAMES.map((n) => (
              <div key={n} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 84, height: 56, borderRadius: 18, background: tilePairs[n].fill }}>
                <div style={{ width: 20, height: 20, borderRadius: 10, background: tilePairs[n].deep }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
