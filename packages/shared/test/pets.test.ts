import { describe, expect, it } from "vitest";
import { FEATURES, FREE_FOREVER, addDaysStr, bagLastsDays, checkInBlocks, daysBetweenStr, defaultGroomWeeks, foodCardState, groomDueOn, groomState, lateMinutes, lbToGrams, petApi, ratio, remindOn, runOutOn, translator, vaccineProblems, vaccineStatus } from "../src/index";

describe("pet date maths", () => {
  it("adds and counts days without a time zone", () => {
    expect(addDaysStr("2026-02-27", 2)).toBe("2026-03-01");
    expect(daysBetweenStr("2026-11-01", "2026-11-04")).toBe(3);
    expect(daysBetweenStr("2026-11-04", "2026-11-01")).toBe(-3);
  });
});

describe("vaccines", () => {
  it("are good through the expiry date and flag the last 30 days", () => {
    expect(vaccineStatus("2026-11-04", "2026-11-04")).toEqual({ status: "expiring", daysLeft: 0 });
    expect(vaccineStatus("2026-11-03", "2026-11-04").status).toBe("expired");
    expect(vaccineStatus("2026-12-04", "2026-11-04").status).toBe("expiring");
    expect(vaccineStatus("2026-12-05", "2026-11-04").status).toBe("current");
  });
  it("lists required kinds that are missing or expired on the day", () => {
    const have = [{ kind: "rabies", expiresOn: "2027-01-01" }, { kind: "bordetella", expiresOn: "2026-10-01" }];
    expect(vaccineProblems(have, ["rabies", "dhpp", "bordetella"], "2026-11-04")).toEqual([{ kind: "dhpp", why: "missing" }, { kind: "bordetella", why: "expired", expiresOn: "2026-10-01" }]);
    expect(vaccineProblems(have, ["rabies"], "2026-11-04")).toEqual([]);
    expect(vaccineProblems([], [], "2026-11-04")).toEqual([]);
  });
});

describe("groom cadence", () => {
  it("defaults by coat and counts in weeks", () => {
    expect(["curly", "long_silky", "double", "short", "wire", "hairless", "unknown"].map(defaultGroomWeeks)).toEqual([5, 4, 8, 8, 8, 8, 8]);
    expect(groomDueOn("2026-10-06", 6)).toBe("2026-11-17");
  });
  it("lists a pet a week before its date and when late, never earlier", () => {
    expect(groomState("2026-11-11", "2026-11-04")).toEqual({ state: "due", daysLate: -7 });
    expect(groomState("2026-11-12", "2026-11-04").state).toBe("later");
    expect(groomState("2026-11-04", "2026-11-04")).toEqual({ state: "due", daysLate: 0 });
    expect(groomState("2026-11-01", "2026-11-04")).toEqual({ state: "late", daysLate: 3 });
  });
});

describe("daycare check-in", () => {
  const base = { day: "2026-11-04", required: ["rabies", "bordetella"], vaccines: [{ kind: "rabies", expiresOn: "2027-01-01" }, { kind: "bordetella", expiresOn: "2026-10-01" }], requireAssessment: true, assessment: "none", inRoom: 16, capacity: 16, payKind: "drop_in" as const, packDaysLeft: 0 };
  it("names everything that stops a dog, in the order to fix it", () => {
    expect(checkInBlocks(base).map((b) => b.code)).toEqual(["vaccine", "assessment", "capacity"]);
    expect(checkInBlocks(base)[0]!.message).toBe("Bordetella expired on Oct 1, 2026.");
    expect(checkInBlocks({ ...base, assessment: "declined" })[1]!.message).toContain("not suitable");
  });
  it("lets a clear dog in, asks for no check when the shop does not", () => {
    expect(checkInBlocks({ ...base, required: ["rabies"], assessment: "passed", inRoom: 3 })).toEqual([]);
    expect(checkInBlocks({ ...base, required: [], requireAssessment: false, inRoom: 15 })).toEqual([]);
  });
  it("an empty pack stops a pack check-in", () => {
    expect(checkInBlocks({ ...base, required: [], requireAssessment: false, inRoom: 0, payKind: "pack", packDaysLeft: 0 }).map((b) => b.code)).toEqual(["pack_empty"]);
  });
  it("counts the ratio and the minutes late after the grace", () => {
    expect(ratio(12, 2)).toBe(6);
    expect(ratio(5, 0)).toBe(5);
    expect(lateMinutes("18:00", 15, 17 * 60 + 59)).toBe(0);
    expect(lateMinutes("18:00", 15, 18 * 60 + 15)).toBe(0);
    expect(lateMinutes("18:00", 15, 18 * 60 + 16)).toBe(16);
  });
});

describe("food cards", () => {
  const prog = { buyCount: 12, expiryMonths: 12 };
  const now = new Date("2026-11-04T15:00:00Z");
  const card = (punches: number, given = 0, start = "2026-06-01T00:00:00Z") => ({ punches, given, cycleStartedAt: start });
  it("counts to N, owes one at N and none before", () => {
    expect(foodCardState(card(0), prog, now)).toMatchObject({ canRedeem: false, toGo: 12, towardNext: 0 });
    expect(foodCardState(card(11), prog, now)).toMatchObject({ canRedeem: false, toGo: 1, towardNext: 11 });
    expect(foodCardState(card(12), prog, now)).toMatchObject({ canRedeem: true, owed: 1, toGo: 0 });
  });
  it("carries extra bags over after a free bag and owes a second at 2N", () => {
    expect(foodCardState(card(15, 1), prog, now)).toMatchObject({ canRedeem: false, towardNext: 3, toGo: 9 });
    expect(foodCardState(card(24, 0), prog, now)).toMatchObject({ canRedeem: true, owed: 2 });
    expect(foodCardState(card(24, 1), prog, now)).toMatchObject({ canRedeem: true, owed: 1 });
  });
  it("forgets bags older than the window", () => {
    expect(foodCardState(card(5, 0, "2025-01-01T00:00:00Z"), prog, now)).toMatchObject({ expired: true, counted: 0, canRedeem: false });
    expect(foodCardState(card(12, 0, "2025-01-01T00:00:00Z"), prog, now).canRedeem).toBe(false);
    expect(foodCardState(card(12, 0, "2025-12-01T00:00:00Z"), prog, now).canRedeem).toBe(true);
  });
  it("works out when a bag runs out and when to text", () => {
    expect(bagLastsDays(11_800, 360)).toBe(32);
    expect(bagLastsDays(100, 500)).toBe(1);
    expect(runOutOn("2026-10-01", 11_800, 360)).toBe("2026-11-02");
    expect(remindOn("2026-11-02")).toBe("2026-10-28");
    expect(lbToGrams(26)).toBe(11_793);
  });
});

describe("plan and contract", () => {
  it("the four features are Plus, for pet shops only, and none is free forever", () => {
    for (const k of ["pets.profiles", "pets.daycare", "pets.food_cards", "pets.report_cards"] as const) {
      expect(FEATURES[k]).toMatchObject({ minPlan: "plus", vertical: "pet", defaultStage: "hidden" });
      expect(FREE_FOREVER).not.toContain(k);
    }
  });
  it("validates bodies", () => {
    expect(petApi.petBody.safeParse({ name: "Biscuit" }).data).toMatchObject({ species: "dog", sizeBand: "medium", coat: "short" });
    expect(petApi.petBody.safeParse({ name: " " }).success).toBe(false);
    expect(petApi.vaccineBody.safeParse({ expiresOn: "2027-01-01" }).success).toBe(true);
    expect(petApi.vaccineBody.safeParse({ expiresOn: "soon" }).success).toBe(false);
    expect(petApi.punchBody.safeParse({ memberId: "x", skuId: "y" }).success).toBe(false);
    expect(petApi.reportCardBody.safeParse({ did: ["bath", "juggling"] }).success).toBe(false);
    expect(petApi.petSettingsBody.safeParse({ closesAt: "7pm" }).success).toBe(false);
  });
  it("the report text and reminders have every language", () => {
    for (const l of ["en", "hi", "ur", "pa"] as const) {
      const t = translator(l);
      expect(t("pet.msg.groomDue", { shop: "S", pet: "P", date: "Nov 3", url: "u" })).toContain("STOP");
      expect(t("pet.msg.report", { shop: "S", pet: "P", summary: "x", url: "u" })).toContain("STOP");
      expect(t("pet.msg.runOut", { name: "N", item: "I", date: "d", shop: "S", url: "u" })).toContain("STOP");
    }
  });
});
