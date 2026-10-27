import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TradeRows } from "@/app/(marketing)/pricing/TradeRows";
import { PriceStrip } from "@/components/marketing/PriceStrip";
import { TradeStories } from "@/components/marketing/TradeStories";
import { copy } from "@/copy/en-CA";
import { buildMerchantNav } from "@/lib/dashboard/nav";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { afterSignupPath, recommendedRestaurantTier } from "@/lib/signupRoute";

describe("signup routes by trade", () => {
  const base = "/m/abc";
  it("sends restaurants, tiffin, caterers and banquet halls to the restaurant plan screen with the right tier", () => {
    expect(afterSignupPath(base, "restaurant")).toBe("/m/abc/billing?welcome=restaurant&tier=starter");
    expect(afterSignupPath(base, "restaurant_south_asian")).toBe("/m/abc/billing?welcome=restaurant&tier=starter");
    expect(afterSignupPath(base, "tiffin")).toBe("/m/abc/billing?welcome=restaurant&tier=growth");
    expect(afterSignupPath(base, "caterer")).toBe("/m/abc/billing?welcome=restaurant&tier=growth");
    expect(afterSignupPath(base, "banquet_hall")).toBe("/m/abc/billing?welcome=restaurant&tier=pro");
    expect(recommendedRestaurantTier("tiffin")).toBe("growth");
  });
  it("sends salons, barbers, repair, studios, pets, auto and grocers to their own setup step", () => {
    for (const v of ["salon", "barber", "repair_electronics", "fitness", "pet", "repair_auto", "car_wash", "grocery"]) expect(afterSignupPath(base, v), v).toBe("/m/abc/setup?step=trade_setup");
  });
  it("keeps the pharmacist's rules first for a pharmacy and the first stamp for cafés and retail", () => {
    expect(afterSignupPath(base, "pharmacy")).toBe("/m/abc/setup?step=pharmacy_rules");
    expect(afterSignupPath(base, "cafe")).toBe("/m/abc/setup?step=first_stamp");
    expect(afterSignupPath(base, "retail")).toBe("/m/abc/setup?step=first_stamp");
    expect(afterSignupPath(base, "florist")).toBe("/m/abc/setup?step=first_stamp");
  });
  it("opens the plan's checkout when a pricing button carried it through signup", () => {
    expect(afterSignupPath(base, "salon", "plus")).toBe("/m/abc/billing?subscribe=plus");
    expect(afterSignupPath(base, "tiffin", "restaurant-growth")).toBe("/m/abc/billing?subscribe=restaurant-growth");
  });
  it("accepts only known plans from the link", () => {
    expect(signupPrefill({ plan: "plus" })).toEqual({ plan: "plus" });
    expect(signupPrefill({ plan: "restaurant-pro" })).toEqual({ plan: "restaurant-pro" });
    expect(signupPrefill({ plan: "enterprise" })).toEqual({});
  });
});

describe("pricing and landing say the same true thing", () => {
  it("lists every trade with its real price, pharmacy appointments free and the 1% class fee", () => {
    const html = renderToStaticMarkup(<TradeRows />);
    expect(html).toContain("Pharmacies");
    expect(html).toContain("Free");
    expect(html).toContain("1% of online class sales");
    expect(html).toContain("0% on desk");
    expect(html).toContain("$39/mo");
    expect(html).toContain("$99, $199 and $349/mo");
    expect(html).not.toMatch(/coming soon|early access|pilot/i);
  });
  it("shows $39 and $99 on the landing, and a salon and a studio story", () => {
    const prices = renderToStaticMarkup(<PriceStrip />);
    expect(prices).toContain("$39");
    expect(prices).toContain("$99");
    const stories = renderToStaticMarkup(<TradeStories />);
    expect(stories).toContain("A salon");
    expect(stories).toContain("A yoga studio");
    expect(stories).toContain("1% of classes");
  });
  it("no longer promises a rep visit or calls on day 7 and 30", () => {
    const l = JSON.stringify(copy.landing);
    expect(l).not.toMatch(/A rep visits|We call on day 7/);
    expect(l).toContain("5 minutes");
    // Trade chips for florists, books and hardware live in VerticalTemplates; the router row names studios and retail.
    expect(copy.landing.router.items[0]!.eyebrow).toMatch(/retail/);
  });
});

describe("street campaigns", () => {
  it("hide for a shop that has no street, show for one that does", () => {
    const enabled = new Set(["campaigns.neighbourhood"] as const);
    const labels = (onOpenStreet?: boolean) => buildMerchantNav("/m/x", "owner", new Set(enabled), { vertical: "retail", plan: "free", stages: { "campaigns.neighbourhood": "ga" }, onOpenStreet }).map((e) => e.key);
    expect(labels(false)).not.toContain("campaigns");
    expect(labels(true)).toContain("campaigns");
    expect(labels(undefined)).toContain("campaigns");
  });
});
