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

describe("pharmacy text check, wider", () => {
  it("catches Hindi, Urdu and Punjabi drug wording, health claims, referrals and a flu jab; leaves the front store alone", () => {
    for (const t of ["दवाई पर 10% छूट", "ادویات پر رعایت", "ਦਵਾਈ ’ਤੇ ਛੋਟ", "Vitamin C boosts immunity", "Refer a friend, get $5", "Get your flu jab today"]) expect(checkPharmacyText(t).ok, t).toBe(false);
    expect(checkPharmacyText("Vitamin C boosts immunity").kind).toBe("claim");
    expect(checkPharmacyText("Refer a friend").kind).toBe("referral");
    for (const t of ["Prefer a bag? Ask at the till", "Sweet treats this week", "Vitamins 2x points"]) expect(checkPharmacyText(t).ok, t).toBe(true);
  });
  it("locks copay, insurance, ODB, test strips and Schedule II or III category names", () => {
    for (const n of ["Insurance copay", "Diabetes test strips", "ODB", "Schedule II", "Schedule 3 items", "Behind the counter", "Pseudoephedrine", "Codeine products"]) expect(isDispensaryCategoryName(n), n).toBe(true);
    for (const n of ["Cough and cold", "Vitamins", "Skin care"]) expect(isDispensaryCategoryName(n), n).toBe(false);
  });
});
