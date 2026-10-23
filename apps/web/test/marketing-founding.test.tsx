import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const founding = vi.fn();
vi.mock("@/lib/api/server", () => ({ publicServerApi: () => ({ public: { foundingRestaurants: founding } }) }));

import { FoundingLine, FoundingStrip, loadFounding } from "@/components/marketing/FoundingStrip";

beforeEach(() => founding.mockReset());

describe("founding strip", () => {
  it("shows the live count from the API", async () => {
    founding.mockResolvedValue({ corridors: [{ slug: "ridgeway-plaza", name: "Ridgeway Plaza", taken: 6, total: 20 }] });
    const html = renderToStaticMarkup(await FoundingStrip());
    expect(html).toContain("14 of 20 founding spots left on Ridgeway Plaza");
    expect(html).toContain("50% off for 12 months, then 25% off for life");
  });
  it("hides when the API fails, when no corridor has a spot, or when there are no corridors", async () => {
    founding.mockRejectedValue(new Error("down"));
    expect(await loadFounding()).toBeNull();
    expect(renderToStaticMarkup((await FoundingStrip()) ?? <></>)).toBe("");
    founding.mockResolvedValue({ corridors: [{ slug: "a", name: "A", taken: 20, total: 20 }] });
    expect(await FoundingStrip()).toBeNull();
    founding.mockResolvedValue({ corridors: [] });
    expect(await FoundingStrip()).toBeNull();
  });
  it("the pricing line falls back to an invitation to ask", async () => {
    founding.mockRejectedValue(new Error("down"));
    expect(renderToStaticMarkup(await FoundingLine())).toBe("Ask us if your corridor still has a spot.");
    founding.mockResolvedValue({ corridors: [{ slug: "a", name: "Ridgeway Plaza", taken: 3, total: 20 }] });
    expect(renderToStaticMarkup(await FoundingLine())).toContain("17 of 20 spots left on Ridgeway Plaza");
  });
});
