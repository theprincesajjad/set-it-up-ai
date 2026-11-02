import { describe, expect, it } from "vitest";
import { cardFor, emptyDraft, firstOpenStep, readDraft, resolveStep, withPrefill, type SignupDraft } from "@/components/onboarding/signup/draft";

const answered = (patch: Partial<SignupDraft> = {}): SignupDraft => ({ ...emptyDraft(), link: "skipped", name: "Corner Café", vertical: "cafe", address: "10 Queen St E", ...patch });

describe("signup steps (wave P)", () => {
  it("opens on the first unanswered step and never past it", () => {
    expect(firstOpenStep(emptyDraft())).toBe("link");
    expect(firstOpenStep({ ...emptyDraft(), link: "skipped" })).toBe("shop");
    expect(firstOpenStep(answered({ vertical: "" }))).toBe("kind");
    expect(firstOpenStep(answered({ address: "" }))).toBe("where");
    expect(firstOpenStep(answered())).toBe("account");
    expect(resolveStep("account", answered({ vertical: "" }))).toBe("kind");
    expect(resolveStep("link", answered())).toBe("link");
    expect(resolveStep("nonsense", answered())).toBe("account");
    expect(resolveStep("live", answered())).toBe("account");
  });

  it("a home studio needs a postal code, a mobile pro nothing, a storefront a street", () => {
    expect(firstOpenStep(answered({ work: "home", address: "", postal: "" }))).toBe("where");
    expect(firstOpenStep(answered({ work: "home", address: "", postal: "m6s2k1" }))).toBe("account");
    expect(firstOpenStep(answered({ work: "mobile", address: "" }))).toBe("account");
  });

  it("an empty reward or an out-of-range goal keeps the owner on the card", () => {
    expect(firstOpenStep(answered({ card: { goal: 10, reward: " " } }))).toBe("card");
    expect(firstOpenStep(answered({ card: { goal: 1, reward: "Free drink" } }))).toBe("card");
    expect(firstOpenStep(answered({ card: { goal: 8, reward: "Free latte" } }))).toBe("account");
  });

  it("once the shop exists only the celebration shows", () => {
    const d = answered({ created: { id: "m1", name: "Corner Café", vertical: "cafe", workSetting: "shop", joinUrl: null, brandColor: null, logo: null } });
    expect(resolveStep("kind", d)).toBe("live");
  });
});

describe("the card", () => {
  it("starts from the trade's template and keeps the owner's edits", () => {
    const cafe = cardFor("cafe", null);
    expect(cafe).toMatchObject({ earnType: "stamps", goal: 10, reward: "Free drink", min: 2, max: 50, step: 1 });
    expect(cardFor("cafe", { goal: 8, reward: "Free latte" })).toMatchObject({ goal: 8, reward: "Free latte", defaults: { goal: 10, reward: "Free drink" } });
    const restaurant = cardFor("restaurant", null);
    expect(restaurant.earnType).toBe("per_dollar");
    expect(restaurant.goal).toBe(250);
    expect(cardFor("", null).reward).toBeTruthy();
  });
});

describe("saved answers", () => {
  it("are checked field by field and never hold a password", () => {
    const d = readDraft(JSON.stringify({ v: 1, link: "read", name: "x".repeat(500), vertical: "weapons", work: "boat", phone: "(416) 555-0123", password: "secret" }));
    expect(d).not.toBeNull();
    expect(d!.link).toBe("ask"); // "read" without the result is not a read
    expect(d!.name).toHaveLength(120);
    expect(d!.vertical).toBe("");
    expect(d!.work).toBe("shop");
    expect(d!.phone).toBe("4165550123");
    expect(JSON.stringify(d)).not.toContain("secret");
    expect(readDraft("{not json")).toBeNull();
    expect(readDraft(JSON.stringify({ v: 2 }))).toBeNull();
  });

  it("a link's values apply once, and a link naming a shop starts fresh", () => {
    const first = withPrefill(answered({ name: "Old" }), { shop: "Nawab Biryani House", vertical: "restaurant", phone: "6475550199" });
    expect(first).toMatchObject({ name: "Nawab Biryani House", vertical: "restaurant", phone: "6475550199", link: "skipped", address: "" });
    const edited = { ...first, name: "Nawab Biryani" };
    expect(withPrefill(edited, { shop: "Nawab Biryani House", vertical: "restaurant", phone: "6475550199" }).name).toBe("Nawab Biryani");
    // A trade-only link (a landing page) keeps what the owner typed.
    expect(withPrefill(answered({ name: "Mo" }), { vertical: "nails" })).toMatchObject({ name: "Mo", vertical: "nails", work: "home" });
    expect(withPrefill(answered(), {})).toEqual(answered());
  });
});
