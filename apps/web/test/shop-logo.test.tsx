import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShopLogo, shopInitials } from "@/components/ui/ShopTile";
import { mapLayerRole } from "@ll/design-tokens";
import { inCategory } from "@/components/pass/mapStyle";

describe("shop logo fallback", () => {
  it("makes initials from the shop name", () => {
    expect(shopInitials("Pinecone Coffee Co.")).toBe("PC");
    expect(shopInitials("The Bike Shop")).toBe("BS");
    expect(shopInitials("Fixit")).toBe("FI");
    expect(shopInitials("Nonna's Table")).toBe("NT");
  });
  it("falls back to initials when there's no logo or it fails to load", () => {
    const { container, rerender } = render(<ShopLogo shop={{ name: "Pinecone Coffee", vertical: "cafe", logoUrl: null }} />);
    expect(screen.getByText("PC")).toBeTruthy();
    rerender(<ShopLogo shop={{ name: "Pinecone Coffee", vertical: "cafe", logoUrl: "https://x.example/broken.png" }} />);
    const img = container.querySelector("img")!;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("PC")).toBeTruthy();
  });
  it("uses the token map style roles (Corner basemap)", () => {
    expect(mapLayerRole({ id: "background", type: "background" })).toBe("background");
    expect(mapLayerRole({ id: "water", type: "fill", "source-layer": "water" })).toBe("water");
    expect(mapLayerRole({ id: "poi_r1", type: "symbol", "source-layer": "poi" })).toBe("hidden");
  });
  it("maps verticals to the rail categories from the tokens", () => {
    expect(inCategory("cafe", "coffee")).toBe(true);
    expect(inCategory("bakery", "coffee")).toBe(false);
    expect(inCategory("repair_auto", "repair")).toBe(true);
    expect(inCategory("anything", "all")).toBe(true);
  });
});
