import { ImageResponse } from "next/og";
import { BRAND } from "@ll/shared";

export const alt = `${BRAND.name}: one card for every shop on your street`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Default social card. Paper canvas, pine type, the Shopfront mark. No text-in-photo. */
export default function OgImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#FAF6EF", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width="88" height="88" viewBox="0 0 64 64">
            <rect x="6" y="10" width="52" height="48" rx="12" fill="#1F6A50" />
            <rect x="6" y="10" width="52" height="16" rx="8" fill="#F5A524" />
            <path d="M24 58V44a8 8 0 0 1 16 0v14z" fill="#FAF6EF" />
            <circle cx="35.5" cy="51" r="2" fill="#F5A524" />
          </svg>
          <div style={{ fontSize: 44, fontWeight: 700, color: "#1F1B16", display: "flex" }}>{BRAND.name}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 76, fontWeight: 700, color: "#1F1B16", lineHeight: 1.05, letterSpacing: -2 }}>One card for every shop on your street.</div>
          <div style={{ fontSize: 34, color: "#655A4C" }}>Free forever · No transaction fees · Unlimited locations</div>
        </div>
        <div style={{ display: "flex", height: 16, background: "#1F6A50", borderRadius: 8 }} />
      </div>
    ),
    size,
  );
}
