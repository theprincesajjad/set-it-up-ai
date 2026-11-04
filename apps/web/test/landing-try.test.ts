import { describe, expect, it } from "vitest";
import { contrastRatio } from "@ll/design-tokens";
import { cardFor, emptyDraft, firstOpenStep, withPrefill } from "@/components/onboarding/signup/draft";
import { copy } from "@/copy/en-CA";
import { signupPrefill } from "@/lib/marketing/signupPrefill";
import { TRY_TRADES, tryColours, tryTrades } from "@/lib/marketing/try-card";
import { buttonName, tryHref } from "@/lib/marketing/try-href";

/** Wave V: the home page's "try it" card maker and its hand-off into signup. */
describe("try it: the card maker's data", () => {
  it("each trade starts with the signup's own card (VERTICAL_TEMPLATES through cardFor)", () => {
    const trades = tryTrades();
    expect(trades.map((t) => t.key)).toEqual(TRY_TRADES.map((t) => t.key));
    for (const t of trades) {
      const card = cardFor(t.vertical, null);
      expect(t.goal).toBe(card.goal);
      expect(t.reward).toBe(card.reward);
      expect(t.kind).toBe(card.earnType === "stamps" ? "stamps" : "points");
      expect(copy.landing.tryIt.trades[t.key]).toBeTruthy();
    }
    // The shop tiles quote these rewards, so they must stay true.
    const by = Object.fromEntries(trades.map((t) => [t.key, t]));
    expect(by.cafe).toMatchObject({ kind: "stamps", goal: 10, reward: "Free drink" });
    expect(by.barber).toMatchObject({ kind: "stamps", goal: 8, reward: "Free cut" });
    expect(by.nails).toMatchObject({ kind: "stamps", goal: 6, reward: "$10 off your next visit" });
    expect(by.repair).toMatchObject({ kind: "points", reward: "Free screen protector" });
    expect(by.corner).toMatchObject({ kind: "points", reward: "$5 off" });
    expect(by.florist).toMatchObject({ kind: "points", reward: "Free single stem" });
  });

  it("every colour on offer reads: pass text on the pass at 4.5:1", () => {
    for (const c of [...tryTrades().map((t) => t.colour), ...tryColours()]) {
      expect(c.base).toMatch(/^#[0-9A-F]{6}$/);
      expect(contrastRatio(c.ink, c.fill)).toBeGreaterThanOrEqual(4.5);
    }
    expect(tryColours()).toHaveLength(copy.landing.tryIt.colours.length);
  });
});

describe("try it: the hand-off into signup", () => {
  it("carries the name, the trade and a picked colour", () => {
    const href = tryHref({ name: "  Fix-It Phone Lab ", vertical: "repair_electronics", colour: "#2f55d4" });
    expect(href).toBe("/signup?shop=Fix-It+Phone+Lab&vertical=repair_electronics&color=2F55D4&src=home-try");
    const q = Object.fromEntries(new URL(href, "https://x.test").searchParams);
    expect(signupPrefill(q)).toEqual({ shop: "Fix-It Phone Lab", vertical: "repair_electronics", color: "#2F55D4", src: "home-try" });
    // The trade's own colour is not sent: signup keeps "the trade's colour".
    expect(tryHref({ name: "Morning Glory Café", vertical: "cafe", colour: null })).toBe("/signup?shop=Morning+Glory+Caf%C3%A9&vertical=cafe&src=home-try");
    // No name: the trade alone.
    expect(tryHref({ name: "", vertical: "barber", colour: null })).toBe("/signup?vertical=barber&src=home-try");
  });

  it("signupPrefill takes a colour with or without #, and drops anything else", () => {
    expect(signupPrefill({ color: "#8a5a3c" }).color).toBe("#8A5A3C");
    expect(signupPrefill({ color: "8A5A3C" }).color).toBe("#8A5A3C");
    for (const bad of ["red", "#FFF", "12345G", "javascript:1", ""]) expect(signupPrefill({ color: bad }).color).toBeUndefined();
  });

  it("the signup draft starts at the shop's name with the trade and the colour filled in", () => {
    const d = withPrefill(emptyDraft(), { shop: "Fix-It Phone Lab", vertical: "repair_electronics", color: "#2F55D4" });
    expect(d).toMatchObject({ name: "Fix-It Phone Lab", vertical: "repair_electronics", color: "#2F55D4", link: "skipped" });
    // Only the address and the account are left; the card step is already answered with the trade's own reward.
    expect(firstOpenStep(d)).toBe("where");
    expect(cardFor(d.vertical, d.card).reward).toBe("Free screen protector");
    // Without a colour the key is the old four-part key, so links from before the colour keep working once-only.
    expect(withPrefill(emptyDraft(), { shop: "A", vertical: "cafe" }).prefillKey).toBe(JSON.stringify(["A", "cafe", "", ""]));
    // A bad colour never reaches the draft.
    expect(withPrefill(emptyDraft(), { shop: "A", color: "#12" }).color).toBeNull();
  });
});

/** Wave W: the try-it button names the shop ("Keep {name}’s card, start free"), cut short for long names. */
describe("try it: the name on the button", () => {
  it("keeps short names whole, trims space, and cuts long ones near 22 characters with an ellipsis", () => {
    expect(buttonName("")).toBe("");
    expect(buttonName("   ")).toBe("");
    expect(buttonName("  Morning   Glory Café ")).toBe("Morning Glory Café");
    expect(buttonName("Gloss Studios")).toBe("Gloss Studios");
    const long = buttonName("The Very Long Neighbourhood Phone Repair Lab");
    expect(long.endsWith("…")).toBe(true);
    expect(Array.from(long).length).toBeLessThanOrEqual(22);
    expect(long).toBe("The Very Long Neighbo…");
    expect(buttonName("Morning Glory Coffee and Pastry")).toBe("Morning Glory Coffee…");
    expect(buttonName("Abcdefghijklmnopqrstuvwxyz")).toBe("Abcdefghijklmnopqrstu…");
    expect(copy.landing.tryIt.ctaNamed.replace("{name}", buttonName("Gloss Studios"))).toBe("Keep Gloss Studios’s card, start free");
  });
});
