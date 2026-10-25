import { describe, expect, it } from "vitest";
import { CATALOGS, LOCALE_CODES, LOCALES, MESSAGE_KEYS, formatCurrency, formatDate, formatMessage, negotiateLocale, normalizeLocale, pickTranslation, spiceKey, t, withRtlMark } from "../src/index.js";

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\s*[,}]/g)].map((m) => m[1]).sort().join(",");
const SCRIPT: Record<string, RegExp> = { hi: /[ऀ-ॿ]/, ur: /[؀-ۿ]/, pa: /[਀-੿]/ };

describe("i18n catalogs", () => {
  it("has every key in every locale, with matching placeholders", () => {
    for (const l of LOCALE_CODES) {
      expect(Object.keys(CATALOGS[l]).sort(), l).toEqual([...MESSAGE_KEYS].sort());
      for (const k of MESSAGE_KEYS) {
        expect(CATALOGS[l][k].trim(), `${l}:${k}`).not.toBe("");
        expect(placeholders(CATALOGS[l][k]), `${l}:${k}`).toBe(placeholders(CATALOGS.en[k]));
      }
    }
  });

  it("writes each locale in its own script", () => {
    for (const l of ["hi", "ur", "pa"] as const) {
      const re = SCRIPT[l]!;
      const bad = MESSAGE_KEYS.filter((k) => !re.test(CATALOGS[l][k]));
      expect(bad, l).toEqual([]);
    }
  });

  it("has locale metadata with rtl only for Urdu", () => {
    expect(LOCALES.ur.dir).toBe("rtl");
    expect(LOCALE_CODES.filter((l) => LOCALES[l].dir === "ltr")).toEqual(["en", "hi", "pa"]);
    expect(LOCALES.hi.fonts).toContain("Noto Sans Devanagari");
    expect(LOCALES.pa.fonts).toContain("Noto Sans Gurmukhi");
    expect(LOCALES.ur.fonts[0]).toBe("Noto Nastaliq Urdu");
  });
});

describe("t()", () => {
  it("interpolates and pluralizes", () => {
    expect(t("en", "menu.serves", { n: 6 })).toBe("Serves 6");
    expect(t("en", "cart.items", { n: 1 })).toBe("1 item");
    expect(t("en", "cart.items", { n: 3 })).toBe("3 items");
    expect(t("hi", "menu.serves", { n: 4 })).toContain("4");
    expect(t("pa", "cart.items", { n: 2 })).toBe("2 ਆਈਟਮਾਂ");
  });
  it("supports =0 and nested variables", () => {
    expect(formatMessage("en", "{n, plural, =0 {none} one {# left} other {# left}} for {who}", { n: 0, who: "you" })).toBe("none for you");
    expect(formatMessage("en", "{n, plural, one {# of {who}} other {# of {who}}}", { n: 2, who: "us" })).toBe("2 of us");
  });
  it("leaves unknown variables visible and falls back to the key", () => {
    expect(formatMessage("en", "Hi {name}")).toBe("Hi {name}");
    expect(t("en", "nope.missing" as never)).toBe("nope.missing");
  });
});

describe("helpers", () => {
  it("normalizes and negotiates locales", () => {
    expect(normalizeLocale("hi-IN")).toBe("hi");
    expect(normalizeLocale("pa_Guru")).toBe("pa");
    expect(normalizeLocale("fr")).toBeNull();
    expect(negotiateLocale("fr;q=0.9, ur-PK;q=0.8, en;q=0.5")).toBe("ur");
    expect(negotiateLocale(null)).toBe("en");
  });
  it("picks translations with per-field fallback", () => {
    const item = { name: "Chicken biryani", description: "Dum cooked", translations: { hi: { name: "चिकन बिरयानी" }, ur: { name: "چکن بریانی", description: "دم پر پکی" } } };
    expect(pickTranslation(item, "hi")).toEqual({ name: "चिकन बिरयानी", description: "Dum cooked" });
    expect(pickTranslation(item, "ur").description).toBe("دم پر پکی");
    expect(pickTranslation(item, "pa").name).toBe("Chicken biryani");
    expect(pickTranslation({ name: "x" }, "en")).toEqual({ name: "x", description: null });
  });
  it("maps spice levels", () => {
    expect([0, 1, 2, 3].map(spiceKey)).toEqual(["spice.mild", "spice.medium", "spice.hot", "spice.extraHot"]);
  });
  it("formats money and dates without throwing", () => {
    for (const l of LOCALE_CODES) {
      expect(formatCurrency(l, 1250)).toMatch(/12/);
      expect(formatDate(l, "2026-10-22T16:00:00Z")).toBeTruthy();
    }
    expect(formatCurrency("en", 1200)).toBe("$12");
  });
});

describe("withRtlMark", () => {
  it("puts an RLM in front of an Urdu message that opens with a Latin run or an isolated name, so the paragraph runs right to left", () => {
    expect(withRtlMark("ur", "Local Loyalty کی خبریں")).toBe("\u200FLocal Loyalty کی خبریں");
    expect(withRtlMark("ur", "\u2068Sarson Dhaba\u2069 میں خوش آمدید")).toBe("\u200F\u2068Sarson Dhaba\u2069 میں خوش آمدید");
    expect(withRtlMark("ur", "(Local Loyalty) کی خبریں")).toBe("\u200F(Local Loyalty) کی خبریں");
  });
  it("leaves messages that open with Urdu, other languages and empty text alone", () => {
    expect(withRtlMark("ur", "آپ کا کارڈ")).toBe("آپ کا کارڈ");
    expect(withRtlMark("ur", "آپ کا کارڈ \u2068Sarson Dhaba\u2069")).toBe("آپ کا کارڈ \u2068Sarson Dhaba\u2069");
    expect(withRtlMark("hi", "Local Loyalty की खबरें")).toBe("Local Loyalty की खबरें");
    expect(withRtlMark("en", "Hello")).toBe("Hello");
    expect(withRtlMark("ur", "")).toBe("");
  });
});

describe("plural counts that are already formatted", () => {
  it("reads \"10,000\" as 10000 and prints it as given (no NaN in hi, ur, pa)", () => {
    for (const l of ["hi", "ur", "pa"] as const) {
      const out = t(l, "auth.unit.points", { n: "10,000" });
      expect(out).not.toContain("NaN");
      expect(out).toContain("10,000");
    }
    expect(t("en", "auth.unit.points", { n: "1" })).toBe("1 point");
    expect(t("en", "auth.unit.points", { n: 12 })).toBe("12 points");
  });
});

describe("plural counts written in local digits", () => {
  it("reads ۲ and ٢ and २ as 2", () => {
    expect(t("ur", "rc.tm.servings", { n: "۲" })).toContain("۲");
    expect(t("ur", "rc.tm.servings", { n: "۲" })).not.toContain("NaN");
    expect(t("hi", "auth.unit.points", { n: "१२" })).not.toContain("NaN");
  });
});
