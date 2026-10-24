import { ImageResponse } from "next/og";
import { BRAND } from "@ll/shared";
import { ogFonts } from "@/lib/og";

export const alt = `${BRAND.name}: one card for every shop on your street`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card (v2): white, black type, the four-corners mark. */
export default async function OgImage() {
  const fonts = await ogFonts();
  const display = fonts.length ? "Bricolage Grotesque" : undefined;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FFFFFF", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="72" height="72" viewBox="0 0 64 64">
            <rect width="64" height="64" rx="16" fill="#0B0B0C" />
            <circle cx="22" cy="22" r="7.5" fill="#FFFFFF" />
            <circle cx="42" cy="22" r="7.5" fill="#FFFFFF" />
            <circle cx="22" cy="42" r="7.5" fill="#FFFFFF" />
            <circle cx="42" cy="42" r="7.5" fill="#FF5A1F" />
          </svg>
          <div style={{ fontSize: 40, fontWeight: 800, color: "#0B0B0C", display: "flex", letterSpacing: -0.4, fontFamily: display }}>{BRAND.name.toLowerCase()}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div style={{ fontSize: 84, fontWeight: 800, color: "#0B0B0C", lineHeight: 1.02, letterSpacing: -1.7, fontFamily: display }}>one card for every shop on your street.</div>
          <div style={{ fontSize: 32, color: "#6B6B70" }}>Free forever · No fee on loyalty · Unlimited locations</div>
        </div>
      </div>
    ),
    { ...size, fonts },
  );
}
