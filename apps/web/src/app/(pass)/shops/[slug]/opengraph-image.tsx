import { ImageResponse } from "next/og";
import { BRAND } from "@ll/shared";
import { publicServerApi } from "@/lib/api/server";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Earn rewards at this shop";

/** Shop social card (v2): "Earn rewards at {Shop}" on white; the shop's own colour only in its avatar. */
export default async function ShopOg({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let name = "a local shop";
  const tint = "#FFFFFF";
  const ink = "#0B0B0C";
  let brand = "#0B0B0C";
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
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: tint, padding: 72, color: ink }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {logo ? (
            <img src={logo} width={120} height={120} style={{ borderRadius: 60 }} alt="" />
          ) : (
            <div style={{ width: 120, height: 120, borderRadius: 60, background: brand, display: "flex" }} />
          )}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 52, fontWeight: 700 }}>{name}</div>
            {where ? <div style={{ fontSize: 32, color: "#6B6B70", fontStyle: "italic" }}>{where.toLowerCase()}</div> : null}
          </div>
        </div>
        <div style={{ fontSize: 80, fontWeight: 800, lineHeight: 1.02, letterSpacing: -3 }}>Earn rewards at {name}</div>
        <div style={{ fontSize: 30, display: "flex", color: "#6B6B70" }}>Part of {BRAND.name} · No app needed · Free</div>
      </div>
    ),
    size,
  );
}
