import { describe, expect, it } from "vitest";
import { PHARMACY_LOCKED_CATEGORIES, PHARMACY_RULES, PHARMACY_SERVICE_PRESETS, checkPharmacyText, isDispensaryCategoryName, pharmacyTextMessage } from "../src/index.js";

describe("pharmacy rules (shared)", () => {
  it("every locked category and every service preset passes its own checks", () => {
    for (const n of PHARMACY_LOCKED_CATEGORIES) expect(isDispensaryCategoryName(n), n).toBe(true);
    for (const n of PHARMACY_SERVICE_PRESETS) expect(checkPharmacyText(n, { mode: "label", allowServiceWords: true }).ok, n).toBe(true);
  });
  it("names the front store as fine and the dispensary as locked", () => {
    for (const n of ["Front store", "Vitamins", "Cold remedies", "Gift wrap"]) expect(isDispensaryCategoryName(n), n).toBe(false);
    for (const n of ["Rx", "Prescriptions", "Pharmacy services", "Dispensing", "Vaccines", "Medication", "Blister packs", "Pill pack", "MedsCheck"]) expect(isDispensaryCategoryName(n), n).toBe(true);
  });
  it("has a rule list with unique ids and a reason in plain words", () => {
    expect(new Set(PHARMACY_RULES.map((r) => r.id)).size).toBe(PHARMACY_RULES.length);
    const c = checkPharmacyText("Your refill is ready");
    expect(c).toMatchObject({ ok: false, kind: "dispensary", term: "refill" });
    expect(pharmacyTextMessage(c, "Your message")).toContain("front store");
    expect(pharmacyTextMessage(checkPharmacyText("diabetes club"))).toContain("health condition");
  });
  it("does not trip on ordinary front-store words", () => {
    for (const t of ["Shop our new shotglass collection", "Tissues, vitamins and sunscreen are 2x points", "Seniors Day on Tuesday", "Earn a point for every dollar"]) expect(checkPharmacyText(t).ok, t).toBe(true);
  });
});
