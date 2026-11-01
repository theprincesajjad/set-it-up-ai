import { render, screen } from "@testing-library/react";
import { contrastRatio } from "@ll/design-tokens";
import { describe, expect, it } from "vitest";
import { BrandMark, BrandPassCard, CardFan, MiniStamps, ShopHero } from "@/components/pass/ShopBrand";
import { shopColorProps, shopColors } from "@/lib/shopColor";

describe("shopColorProps", () => {
  it("a shop with a brand colour gets data-shop-color and both modes inline", () => {
    const p = shopColorProps({ vertical: "nails", brandColor: "#4338CA" });
    expect(p["data-trade"]).toBe("nails");
    expect(p["data-shop-color"]).toBe("brand");
    const style = p.style as Record<string, string>;
    expect(style["--shop-l-trade"]).toBe("#4338CA");
    expect(style["--shop-d-trade"]).toMatch(/^#[0-9A-F]{6}$/);
    expect(contrastRatio(style["--shop-l-trade-pass-text"]!, style["--shop-l-trade-pass-from"]!)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(style["--shop-d-trade-pass-text"]!, style["--shop-d-trade-pass-from"]!)).toBeGreaterThanOrEqual(4.5);
  });

  it("without one, only the trade (tokens.css already holds the AA-checked family): nails pink, café brown", () => {
    expect(shopColorProps({ vertical: "nails", brandColor: null })).toEqual({ "data-trade": "nails" });
    expect(shopColorProps({ vertical: "cafe" })).toEqual({ "data-trade": "cafe" });
    expect(shopColors({ vertical: "nails" }).family).toBe("rose");
    expect(shopColors({ vertical: "cafe" }).family).toBe("cafe");
  });

  it("a malformed brand colour falls back to the trade", () => {
    expect(shopColorProps({ vertical: "barber", brandColor: "javascript:alert(1)" })).toEqual({ "data-trade": "barber" });
  });

  it("a pale brand colour is darkened before it is used as a fill", () => {
    const style = shopColorProps({ vertical: "nails", brandColor: "#FFE4EC" }).style as Record<string, string>;
    expect(style["--shop-l-trade"]).not.toBe("#FFE4EC");
    expect(contrastRatio(style["--shop-l-trade"]!, "#FFFFFF")).toBeGreaterThanOrEqual(3);
  });

  it("no shop: nothing", () => {
    expect(shopColorProps(null)).toEqual({});
  });
});

describe("ShopBrand components", () => {
  const shop = { name: "Nails by Amara", vertical: "nails", logoUrl: null, brandColor: null };

  it("BrandMark shows the initials on the colour (or on white over the colour)", () => {
    const { container } = render(<><BrandMark shop={shop} /><BrandMark shop={shop} onColor /></>);
    const [a, b] = Array.from(container.querySelectorAll("[data-testid=brand-mark]"));
    expect(a!.textContent).toBe("NB");
    expect(a!.className).toContain("bg-trade");
    expect(b!.className).toContain("bg-trade-pass-text");
  });

  it("BrandPassCard is a card on the colour; with scope it carries the shop's colour itself", () => {
    render(<BrandPassCard shop={{ ...shop, brandColor: "#1A7F5A" }} scope kicker="nail studio" aria-label="pass" />);
    const card = screen.getByRole("region", { name: "pass" });
    expect(card.className).toContain("bg-trade");
    expect(card.className).toContain("text-trade-pass-text");
    expect(card.getAttribute("data-shop-color")).toBe("brand");
    expect(card.textContent).toContain("Nails by Amara");
  });

  it("ShopHero puts the name in the h1 and shows the offer with the stamps", () => {
    const { container } = render(<ShopHero shop={shop} subtitle="nail studio" offer="6 stamps = $10 off" goal={6} />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Nails by Amara");
    expect(screen.getByText("6 stamps = $10 off")).toBeTruthy();
    expect(container.querySelectorAll("[data-testid=shop-hero] .size-5.rounded-full")).toHaveLength(6);
  });

  it("MiniStamps marks earned stamps and the reward slot", () => {
    const { container } = render(<MiniStamps goal={6} filled={2} />);
    const dots = Array.from(container.querySelectorAll("span"));
    expect(dots).toHaveLength(6);
    expect(dots[0]!.className).toContain("bg-trade-pass-text");
    expect(dots[5]!.className).toContain("bg-trade-pass-text/25");
  });

  it("CardFan draws three trade-coloured cards", () => {
    const { container } = render(<CardFan />);
    expect(Array.from(container.querySelectorAll("[data-trade]")).map((e) => e.getAttribute("data-trade"))).toEqual(["nails", "cafe", "grocery"]);
  });
});
