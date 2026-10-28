import { ImageResponse } from "next/og";
import { palette, rolesV3 } from "@ll/design-tokens";
import { BRAND } from "@ll/shared";
import { ogFonts } from "@/lib/og";

export const alt = `${BRAND.name}: one card for every shop on your street`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const c = rolesV3.light;
const STRIPES = 12;

/** Default social card (v3): paper canvas, the awning stripe, black type, the four-corners mark and the wordmark. */
export default async function OgImage() {
  const fonts = await ogFonts();
  const display = fonts.length ? "Bricolage Grotesque" : undefined;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", background: c.paper }}>
        {/* Awning: points and paper stripes with scalloped ends, one per page. */}
        <div style={{ display: "flex", width: "100%", height: 40 }}>
          {Array.from({ length: STRIPES }, (_, i) => (
            <div key={i} style={{ flex: 1, height: 40, background: i % 2 === 0 ? c.points : c.background, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 }} />
          ))}
        </div>
        <div style={{ display: "flex", flex: 1, flexDirection: "column", justifyContent: "space-between", padding: "40px 72px 64px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <svg width="72" height="72" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill={c.foreground} />
              <circle cx="22" cy="22" r="7.5" fill={c.background} />
              <circle cx="42" cy="22" r="7.5" fill={c.background} />
              <circle cx="22" cy="42" r="7.5" fill={c.background} />
              <circle cx="42" cy="42" r="7.5" fill={c.points} />
            </svg>
            <div style={{ fontSize: 40, fontWeight: 800, color: c.foreground, display: "flex", letterSpacing: -0.4, fontFamily: display }}>{BRAND.name.toLowerCase()}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <div style={{ fontSize: 84, fontWeight: 800, color: c.foreground, lineHeight: 1.02, letterSpacing: -1.7, fontFamily: display }}>one card for every shop on your street.</div>
            <div style={{ fontSize: 32, color: palette.stone[600] }}>Free forever · No fee on loyalty · Unlimited locations</div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
