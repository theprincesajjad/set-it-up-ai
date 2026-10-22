import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShopLogo, shopInitials } from "@/components/ui/ShopTile";
import { layerRole } from "@/components/pass/mapStyle";

describe("shop logo fallback", () => {
  it("makes initials from the shop name", () => {
    expect(shopInitials("Pinecone Coffee Co.")).toBe("PC");
    expect(shopInitials("The Bike Shop")).toBe("BS");
    expect(shopInitials("Fixit")).toBe("FI");
    expect(shopInitials("Nonna's Table")).toBe("NT");
  });
  it("falls back to coloured initials when there's no logo or it fails to load", () => {
    const { container, rerender } = render(<ShopLogo shop={{ name: "Pinecone Coffee", vertical: "cafe", logoUrl: null }} />);
    expect(screen.getByText("PC")).toBeTruthy();
    rerender(<ShopLogo shop={{ name: "Pinecone Coffee", vertical: "cafe", logoUrl: "https://x.example/broken.png" }} />);
    const img = container.querySelector("img")!;
    expect(img).toBeTruthy();
    fireEvent.error(img);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("PC")).toBeTruthy();
  });
  it("classifies vector style layers for muting", () => {
    expect(layerRole({ id: "background", type: "background" })).toBe("background");
    expect(layerRole({ id: "water", type: "fill" })).toBe("water");
    expect(layerRole({ id: "poi_r1", type: "symbol" })).toBe("poi");
    expect(layerRole({ id: "highway_name_other", type: "symbol" })).toBe("label");
  });
});
