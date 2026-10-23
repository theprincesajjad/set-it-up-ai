import { describe, expect, it } from "vitest";
import { LOCALE_CODES, t } from "@ll/shared";
import { withLang } from "../src/lib/i18n/url";

describe("withLang", () => {
  it("adds the language to a return path, keeping its query and hash", () => {
    expect(withLang("/shops/zeenat/tiffin", "ur")).toBe("/shops/zeenat/tiffin?lang=ur");
    expect(withLang("/shops/zeenat/tiffin?plan=p1&servings=2", "pa")).toBe("/shops/zeenat/tiffin?plan=p1&servings=2&lang=pa");
    expect(withLang("/me#cards", "hi")).toBe("/me?lang=hi#cards");
  });
  it("leaves English paths and an existing lang alone", () => {
    expect(withLang("/me", "en")).toBe("/me");
    expect(withLang("/me?lang=hi", "ur")).toBe("/me?lang=hi");
  });
});

describe("CASL consent wording", () => {
  it("names the shop and says it is optional and how to stop, in every language", () => {
    for (const l of LOCALE_CODES) {
      const text = t(l, "auth.consent.merchant", { shop: "Sarson Dhaba" });
      expect(text, l).toContain("Sarson Dhaba");
      const caption = t(l, "auth.consent.caption", { sender: "Sarson Dhaba, 1 Main St", brand: "Local Loyalty" });
      expect(caption, l).toContain("STOP");
      expect(caption, l).toContain("Sarson Dhaba");
      expect(t(l, "auth.consent.merchantApp", { shop: "Sarson Dhaba", brand: "Local Loyalty" }), l).toContain("STOP");
    }
  });
});
