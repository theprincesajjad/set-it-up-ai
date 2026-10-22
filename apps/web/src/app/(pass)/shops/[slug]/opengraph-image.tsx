import { ImageResponse } from "next/og";
import { BRAND } from "@ll/shared";
import { verticalVisual } from "@ll/design-tokens";
import { publicServerApi } from "@/lib/api/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Earn rewards at this shop";

/** Shop social card: "Earn rewards at {Shop}" on the vertical tint, logo if any. */
export default async function ShopOg({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let name = "a local shop";
  let tint = "#FAF6EF";
  let ink = "#1F1B16";
  let logo: string | null = null;
  let where = "";
  try {
    const s = await publicServerApi().public.shop(slug);
    name = s.merchant.name;
    const v = verticalVisual(s.merchant.vertical);
    tint = v.light.tint;
    ink = v.light.ink;
    logo = s.merchant.logoUrl;
    where = s.merchant.neighbourhood?.name ?? "";
  } catch {
    /* generic card */
  }
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: tint, padding: 72, color: ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {logo ? (
            <img src={logo} width={120} height={120} style={{ borderRadius: 24 }} alt="" />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: 24, background: "#1F6A50", display: "flex" }} />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 52, fontWeight: 700 }}>{name}</div>
            {where ? <div style={{ fontSize: 32 }}>{where}</div> : null}
          </div>
        </div>
        <div style={{ fontSize: 80, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>Earn rewards at {name}</div>
        <div style={{ fontSize: 30, display: "flex" }}>Part of {BRAND.name} · No app needed · Free</div>
      </div>
    ),
    size,
  );
}
