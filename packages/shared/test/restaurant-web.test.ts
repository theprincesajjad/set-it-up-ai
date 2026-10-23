import { describe, expect, it } from "vitest";
import { LOCALE_CODES, halalBanner, allMeatHalal, restaurantApi, restaurantWebApi, translator, type Locale } from "../src/index.js";

const month = (d: string) => d.slice(0, 7);

describe("halal block sentences", () => {
  const base = { slaughter: "zabihah", certifier: "Crescent Halal Council", validUntil: "2027-03-14", fileUrl: null, expired: false } as const;

  it("states scope, slaughter, certifier and expiry, and nothing else", () => {
    const t = translator("en");
    expect(halalBanner({ ...base, scope: "all_meat" }, t, month)).toMatchObject({ title: "All meat is zabihah", sub: "Certified by Crescent Halal Council · valid to 2027-03", note: null, expired: false });
    expect(halalBanner({ ...base, scope: "all_meat", slaughter: "unspecified" }, t, month).title).toBe("All meat is halal");
    expect(halalBanner({ ...base, scope: "all_meat", slaughter: "machine" }, t, month).title).toBe("All meat is halal, machine slaughtered");
    const some = halalBanner({ ...base, scope: "some_dishes", slaughter: "unspecified" }, t, month);
    expect(some.title).toBe("Some dishes are halal");
    expect(some.note).toBe("Look for the halal tag on each dish.");
    expect(halalBanner({ ...base, scope: "all_meat", validUntil: null }, t, month).sub).toBe("Certified by Crescent Halal Council");
  });

  it("past its date it says so and names no certifier", () => {
    const b = halalBanner({ scope: "all_meat", slaughter: "zabihah", certifier: null, validUntil: "2026-10-01", fileUrl: null, expired: true }, translator("en"), month);
    expect(b).toMatchObject({ title: "Certificate expired, ask the restaurant", expired: true, fileUrl: null });
    expect(JSON.stringify(b)).not.toContain("Crescent");
    // A record with no certifier is never printed as a claim, even if it claims to be current.
    expect(halalBanner({ scope: "all_meat", slaughter: "zabihah", certifier: null, validUntil: null, fileUrl: null, expired: false }, translator("en"), month).expired).toBe(true);
  });

  it("reads the same facts in every language, each with its certifier", () => {
    for (const l of LOCALE_CODES as readonly Locale[]) {
      const b = halalBanner({ ...base, scope: "all_meat" }, translator(l), month);
      expect(b.sub, l).toContain("Crescent Halal Council");
      expect(b.title, l).not.toBe("");
      if (l !== "en") expect(b.title, l).not.toBe(halalBanner({ ...base, scope: "all_meat" }, translator("en"), month).title);
    }
  });

  it("allMeatHalal: only a current all-meat claim hides per-dish halal tags", () => {
    expect(allMeatHalal({ ...base, scope: "all_meat" })).toBe(true);
    expect(allMeatHalal({ ...base, scope: "some_dishes" })).toBe(false);
    expect(allMeatHalal({ ...base, scope: "all_meat", expired: true })).toBe(false);
    expect(allMeatHalal(null)).toBe(false);
  });
});

describe("halal certification body", () => {
  const ok = { certifier: "Crescent Halal Council", scope: "all_meat", slaughter: "zabihah", validUntil: "2027-03-14" };
  it("needs a certifier, a known scope and an https link", () => {
    expect(restaurantWebApi.halalCertificationBody.safeParse(ok).success).toBe(true);
    expect(restaurantWebApi.halalCertificationBody.safeParse({ ...ok, certifier: "  " }).success).toBe(false);
    expect(restaurantWebApi.halalCertificationBody.safeParse({ ...ok, scope: "everything" }).success).toBe(false);
    expect(restaurantWebApi.halalCertificationBody.safeParse({ ...ok, fileUrl: "http://example.com/c.pdf" }).success).toBe(false);
    expect(restaurantWebApi.halalCertificationBody.safeParse({ ...ok, validUntil: "March 2027" }).success).toBe(false);
    expect(restaurantWebApi.halalCertificationBody.parse({ certifier: "X", scope: "some_dishes" }).slaughter).toBe("unspecified");
  });
});

describe("priority allergens", () => {
  it("maps what owners type to the eleven keys", () => {
    const c = restaurantWebApi.canonicalAllergen;
    expect([c("Peanuts"), c("peanut"), c("Tree nuts"), c("nuts"), c("tree-nut"), c("almonds"), c("Dairy"), c("milk"), c("Gluten"), c("wheat"), c("Eggs"), c("Sulfites")]).toEqual(["peanut", "peanut", "tree_nut", "tree_nut", "tree_nut", "tree_nut", "milk", "milk", "wheat", "wheat", "egg", "sulphites"]);
    expect(c("unicorn")).toBeNull();
    expect(restaurantWebApi.dishAllergens(["dairy", "Milk", "nuts", "mystery"])).toEqual(["milk", "tree_nut"]);
    expect(restaurantWebApi.dishAllergens(undefined)).toEqual([]);
  });

  it("the public menu query keeps only known keys in 'without'", () => {
    expect(restaurantApi.publicMenuQuery.parse({ without: "peanut, tree_nut,unicorn,nuts" }).without).toEqual(["peanut", "tree_nut"]);
    expect(restaurantApi.publicMenuQuery.parse({}).without).toEqual([]);
  });
});

describe("dish options schema", () => {
  const size = { id: "size", name: "Size", type: "single", required: true, priceMode: "absolute", options: [{ id: "full", name: "Full", priceCents: 18900 }, { id: "half", name: "Half", priceCents: 9900 }] };
  const spice = { id: "spice", name: "Spice", type: "single", required: false, options: [{ id: "mild", name: "Mild", priceCents: 0 }] };
  it("accepts one price-setting group and defaults the rest to deltas", () => {
    const parsed = restaurantWebApi.itemOptionsSchema.parse({ groups: [size, spice] });
    expect(parsed.groups[1]!.priceMode).toBe("delta");
  });
  it("refuses duplicate ids, two price-setting groups, and a price-setting group that is optional or multi", () => {
    const p = (groups: unknown[]) => restaurantWebApi.itemOptionsSchema.safeParse({ groups }).success;
    expect(p([size, { ...size, id: "size" }])).toBe(false);
    expect(p([size, { ...size, id: "size2" }])).toBe(false);
    expect(p([{ ...size, required: false }])).toBe(false);
    expect(p([{ ...size, type: "multi" }])).toBe(false);
    expect(p([{ ...spice, options: [{ id: "a", name: "A", priceCents: 0 }, { id: "a", name: "B", priceCents: 0 }] }])).toBe(false);
    expect(p([{ ...spice, id: "bad id!" }])).toBe(false);
  });
});

describe("review reply body", () => {
  it("needs a channel and text", () => {
    expect(restaurantWebApi.reviewReplyBody.safeParse({ channel: "email", body: "Sorry" }).success).toBe(true);
    expect(restaurantWebApi.reviewReplyBody.safeParse({ channel: "push", body: "Sorry" }).success).toBe(false);
    expect(restaurantWebApi.reviewReplyBody.safeParse({ channel: "sms", body: "  " }).success).toBe(false);
  });
});
