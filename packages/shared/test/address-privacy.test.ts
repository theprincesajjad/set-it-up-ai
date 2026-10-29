import { describe, expect, it } from "vitest";
import { AREA_PIN_MAX_METRES, bookingMaySeeAddress, defaultVisibility, normalizePostal, offsetPin, postalFsa, publicPin, publicPlaceLine } from "../src/address-privacy.js";
import { distanceMetres } from "../src/points.js";
import { dueSoloNudge, instagramHandle, onboardingPath, slugProblem, soloNextMove } from "../src/onboarding.js";
import { SERVICE_STARTERS } from "../src/service-starters.js";
import { VERTICAL_TEMPLATES } from "../src/verticals.js";

describe("address privacy", () => {
  const c = { lat: 43.6505, lng: -79.4757 };
  it("the offset pin is stable per merchant and within 400 m", () => {
    for (const id of ["a", "b", "merchant-1", "8b1e6c8e-0000-4000-8000-000000000001"]) {
      expect(offsetPin(id, c)).toEqual(offsetPin(id, c));
      expect(distanceMetres(c, offsetPin(id, c))).toBeLessThanOrEqual(AREA_PIN_MAX_METRES + 1);
    }
  });
  it("public line and pin never carry the street for area or city", () => {
    const row = { address: "12 Willard Ave", areaLabel: "Bloor West", city: "Toronto", lat: 43.65, lng: -79.48, mapLat: 43.651, mapLng: -79.476 };
    expect(publicPlaceLine({ ...row, addressVisibility: "area" })).toBe("Bloor West area");
    expect(publicPlaceLine({ ...row, addressVisibility: "city" })).toBe("Toronto");
    expect(publicPlaceLine({ ...row, addressVisibility: "exact" })).toBe("12 Willard Ave");
    expect(publicPin({ ...row, addressVisibility: "area" })).toEqual({ lat: 43.651, lng: -79.476 });
    expect(publicPin({ ...row, addressVisibility: "area", mapLat: null, mapLng: null })).toEqual({ lat: null, lng: null });
  });
  it("only a confirmed booking may see it", () => {
    expect(bookingMaySeeAddress({ status: "booked", holdExpiresAt: new Date() })).toBe(false);
    expect(bookingMaySeeAddress({ status: "booked", holdExpiresAt: null })).toBe(true);
    expect(bookingMaySeeAddress({ status: "cancelled", holdExpiresAt: null })).toBe(false);
    expect(bookingMaySeeAddress({ status: "no_show", holdExpiresAt: null })).toBe(false);
  });
  it("reads postal codes and the signup answer", () => {
    expect(normalizePostal("m6s2k1")).toBe("M6S 2K1");
    expect(postalFsa("M6S 2K1")).toBe("M6S");
    expect(normalizePostal("12345")).toBeNull();
    expect(defaultVisibility("home")).toBe("area");
    expect(defaultVisibility("mobile")).toBe("city");
    expect(defaultVisibility("shop")).toBe("exact");
  });
});

describe("solo onboarding rules", () => {
  it("new verticals carry a six-stamp card and starter services", () => {
    for (const v of ["nails", "brows_lashes", "makeup"] as const) {
      expect(VERTICAL_TEMPLATES[v]).toMatchObject({ earnType: "stamps", stampGoal: 6, upsellPlan: "plus" });
      expect(VERTICAL_TEMPLATES[v].rewards[0]).toMatchObject({ rewardType: "amount_off", value: 1000 });
      expect(SERVICE_STARTERS[v]!.length).toBeGreaterThanOrEqual(4);
      for (const s of SERVICE_STARTERS[v]!) if (s.durationMin >= 60 && v !== "makeup") expect(s.depositCents ?? 0).toBeGreaterThan(0);
    }
  });
  it("paths, slugs, handles, next moves and nudges", () => {
    expect(onboardingPath("nails", null)).toBe("solo");
    expect(onboardingPath("salon", null)).toBe("storefront");
    expect(slugProblem("nails-by-mo")).toBeNull();
    expect(slugProblem("ab")).toBe("format");
    expect(slugProblem("admin")).toBe("reserved");
    expect(instagramHandle("https://instagram.com/Nails.By.Mo/")).toBe("nails.by.mo");
    expect(instagramHandle("not a handle")).toBeNull();
    expect(soloNextMove({ shared: false, invited: false, bookings: 0, depositOn: false })).toBe("share");
    expect(soloNextMove({ shared: true, invited: true, bookings: 5, depositOn: true })).toBe("story");
    expect(dueSoloNudge({ hoursSinceSignup: 25, shared: false, bookings: 0, paying: false, annual: false, sent: new Set() })).toBe("solo_d1");
    expect(dueSoloNudge({ hoursSinceSignup: 25, shared: true, bookings: 0, paying: false, annual: false, sent: new Set() })).toBeNull();
    expect(dueSoloNudge({ hoursSinceSignup: 24 * 8, shared: true, bookings: 1, paying: false, annual: false, sent: new Set() })).toBe("solo_d7");
  });
});
