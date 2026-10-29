import { describe, expect, it } from "vitest";
import {
  DEFAULT_SERVICES,
  DEFAULT_TIRE_SETTINGS,
  FEATURES,
  FREE_FOREVER,
  addMonthsStr,
  currentOrNextWindow,
  dayPlan,
  estimateMissing,
  isFeatureEnabled,
  kmPerDay,
  normalizePlate,
  percentOver,
  pickupRemindOn,
  reminderState,
  setForWindow,
  swapsPerDay,
  tireWindowOn,
  treadStatus,
  washDecision,
  type ServiceDef,
} from "../src/index.js";

const oil = DEFAULT_SERVICES.find((s) => s.key === "oil") as ServiceDef;

describe("km a day", () => {
  it("uses the span of the latest readings, else the default, else the override", () => {
    expect(kmPerDay([{ km: 10000, day: "2026-01-01" }, { km: 11400, day: "2026-01-15" }])).toEqual({ value: 100, basis: "readings" });
    expect(kmPerDay([{ km: 10000, day: "2026-01-01" }])).toEqual({ value: 40, basis: "default" });
    // Two readings only a week apart say nothing about a rate.
    expect(kmPerDay([{ km: 10000, day: "2026-01-01" }, { km: 10500, day: "2026-01-08" }], 33)).toEqual({ value: 33, basis: "default" });
    expect(kmPerDay([{ km: 10000, day: "2026-01-01" }, { km: 11400, day: "2026-01-15" }], 40, 25)).toEqual({ value: 25, basis: "override" });
  });
  it("ignores a reading that goes backwards and clamps absurd rates", () => {
    expect(kmPerDay([{ km: 20000, day: "2026-01-01" }, { km: 19000, day: "2026-02-01" }, { km: 19500, day: "2026-03-01" }])).toEqual({ value: 18, basis: "readings" });
    expect(kmPerDay([{ km: 0, day: "2026-01-01" }, { km: 100000, day: "2026-02-01" }]).value).toBe(400);
    expect(kmPerDay([{ km: 1000, day: "2026-01-01" }, { km: 1010, day: "2026-03-01" }]).value).toBe(5);
  });
});

describe("months arithmetic", () => {
  it("keeps the day and clamps to a short month", () => {
    expect(addMonthsStr("2026-10-14", 6)).toBe("2027-04-14");
    expect(addMonthsStr("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsStr("2026-11-30", 3)).toBe("2027-02-28");
  });
});

describe("service reminder: km or months, whichever comes first", () => {
  const base = { service: oil, use: "personal" as const, today: "2026-10-27" };
  const last = { day: "2026-10-14", km: 82100 };
  it("a high-km car is due by km long before the months date", () => {
    const r = reminderState({ ...base, last, latest: { km: 84210, day: "2026-10-14" }, perDay: 100 });
    expect(r).toMatchObject({ basis: "km", dueOn: "2026-12-12", dueByMonthsOn: "2027-04-14", dueAtKm: 90100, daysToDue: 46, status: "ok" });
  });
  it("a low-km car is due by months", () => {
    const r = reminderState({ ...base, last, latest: { km: 84210, day: "2026-10-14" }, perDay: 10 });
    expect(r).toMatchObject({ basis: "months", dueOn: "2027-04-14", daysToDue: 169, status: "ok" });
  });
  it("overdue, due soon by days, due soon by km", () => {
    expect(reminderState({ ...base, last: { day: "2026-01-05", km: 70000 }, latest: { km: 79000, day: "2026-10-20" }, perDay: 50 })).toMatchObject({ status: "overdue", dueOn: "2026-07-05", basis: "months" });
    expect(reminderState({ ...base, last: { day: "2026-05-01", km: 80000 }, latest: { km: 80100, day: "2026-10-27" }, perDay: 50 })).toMatchObject({ status: "due_soon", dueOn: "2026-11-01" });
    expect(reminderState({ ...base, last: { day: "2026-10-20", km: 80000 }, latest: { km: 87500, day: "2026-10-27" }, perDay: 100 })).toMatchObject({ status: "due_soon", kmLeft: 500 });
  });
  it("a km interval with no reading falls back to months; a car never serviced is unknown", () => {
    expect(reminderState({ ...base, last, latest: null, perDay: 40 })).toMatchObject({ basis: "months", dueByKmOn: null, dueOn: "2027-04-14" });
    expect(reminderState({ ...base, last: null, latest: null, perDay: 40 })).toMatchObject({ status: "unknown", dueOn: null });
  });
  it("a rideshare car uses the severe interval", () => {
    const r = reminderState({ ...base, use: "rideshare", last, latest: { km: 84210, day: "2026-10-14" }, perDay: 100 });
    expect(r.dueAtKm).toBe(87100);
    expect(r.dueByMonthsOn).toBe("2027-02-14");
  });
});

describe("tires", () => {
  it("tread flags: under 3.2 mm replace soon, under 1.6 mm the wear bar", () => {
    expect([32, 31, 16, 15].map(treadStatus)).toEqual(["ok", "replace_soon", "replace_soon", "wear_bar"]);
    expect(treadStatus(null)).toBe("unknown");
  });
  it("capacity is bays x hours / minutes a swap, rounded down", () => {
    expect(swapsPerDay(DEFAULT_TIRE_SETTINGS)).toBe(21);
    expect(swapsPerDay({ bays: 1, hoursPerDay: 8, minutesPerSwap: 60 })).toBe(8);
    expect(dayPlan("2026-11-01", 21, DEFAULT_TIRE_SETTINGS)).toMatchObject({ full: true, free: 0 });
    expect(dayPlan("2026-11-01", 25, DEFAULT_TIRE_SETTINGS)).toMatchObject({ full: true, free: 0 });
    expect(dayPlan("2026-11-01", 4, DEFAULT_TIRE_SETTINGS)).toMatchObject({ full: false, free: 17 });
  });
  it("windows: fall Oct 15 to Nov 30, spring Mar 25 to Apr 30", () => {
    const s = DEFAULT_TIRE_SETTINGS;
    expect([ "2026-10-14", "2026-10-15", "2026-11-30", "2026-12-01", "2027-03-25", "2027-04-30", "2027-05-01"].map((d) => tireWindowOn(d, s))).toEqual([null, "fall", "fall", null, "spring", "spring", null]);
    expect(currentOrNextWindow("2026-10-27", s)).toMatchObject({ name: "fall", open: true, start: "2026-10-15", end: "2026-11-30" });
    expect(currentOrNextWindow("2026-12-05", s)).toMatchObject({ name: "spring", open: false, start: "2027-03-25" });
    expect(currentOrNextWindow("2026-06-01", s)).toMatchObject({ name: "fall", open: false, start: "2026-10-15" });
    expect(setForWindow("fall")).toBe("winter");
    expect(setForWindow("spring")).toBe("summer");
    expect(pickupRemindOn("2026-10-15", 14)).toBe("2026-10-01");
  });
});

describe("wash decision", () => {
  const ok = { punchLeft: 0, washesToday: 0, maxPerDay: 1 };
  it("an active plan is let in once a day", () => {
    expect(washDecision({ ...ok, membership: "active" })).toEqual({ ok: true, kind: "member", reason: null });
    expect(washDecision({ ...ok, membership: "active", washesToday: 1 })).toMatchObject({ ok: false, reason: "already_washed" });
    expect(washDecision({ ...ok, membership: "active", washesToday: 1, maxPerDay: 2 }).ok).toBe(true);
  });
  it("a plan that is not active is refused with its reason, even with a punch card", () => {
    for (const m of ["frozen", "past_due", "pending"] as const) expect(washDecision({ ...ok, membership: m, punchLeft: 3 })).toMatchObject({ ok: false, reason: m });
  });
  it("a punch card works when there is no plan or the plan ended", () => {
    expect(washDecision({ ...ok, membership: "none", punchLeft: 3 })).toEqual({ ok: true, kind: "punch", reason: null });
    expect(washDecision({ ...ok, membership: "cancelled", punchLeft: 1 }).kind).toBe("punch");
    expect(washDecision({ ...ok, membership: "none" })).toMatchObject({ ok: false, reason: "no_plan" });
    expect(washDecision({ ...ok, membership: "expired" })).toMatchObject({ ok: false, reason: "expired" });
  });
});

describe("vehicle estimate", () => {
  const full = { vehicleLabel: "2019 Honda Civic", mileageIn: "84210", promisedAt: "2026-10-29T21:00:00Z", expiresAt: "2026-10-30T21:00:00Z", lines: [{ kind: "part", condition: "new", description: "Filter" }, { kind: "labour", description: "Labour" }] };
  it("is complete with the car, odometer, dates and each part's condition", () => {
    expect(estimateMissing(full)).toEqual([]);
  });
  it("lists what is missing in words", () => {
    expect(estimateMissing({ ...full, vehicleLabel: null, mileageIn: "n/a", promisedAt: null, expiresAt: null, lines: [{ kind: "part", description: "A" }, { kind: "part", condition: "used", description: "B" }, { kind: "part", description: "C" }] })).toEqual([
      "the vehicle (make and model)",
      "the odometer reading",
      "when the work will be done",
      "when the estimate expires",
      "new, used or reconditioned on 2 parts",
    ]);
  });
  it("percent over the estimate, one decimal", () => {
    expect(percentOver(20227, 20690)).toBe(2.3);
    expect(percentOver(20227, 22249)).toBe(10);
    expect(percentOver(20227, 19000)).toBe(-6.1);
    expect(percentOver(0, 100)).toBe(0);
  });
});

describe("plates and plans", () => {
  it("normalises plates", () => {
    expect(normalizePlate(" abc-123 ")).toBe("ABC123");
    expect(normalizePlate("a")).toBeNull();
    expect(normalizePlate("ABCDEFGHIJ")).toBeNull();
    expect(normalizePlate(null)).toBeNull();
  });
  it("features are Pro ($39) for their trade and never free", () => {
    for (const k of ["auto.vehicles", "auto.tires", "auto.wash"] as const) {
      expect(FEATURES[k]).toMatchObject({ minPlan: "plus", defaultStage: "ga" });
      expect(FREE_FOREVER).not.toContain(k);
    }
    const ga = { stage: "ga" as const, plan: "plus" as const };
    expect(isFeatureEnabled("auto.wash", { ...ga, vertical: "car_wash" })).toBe(true);
    expect(isFeatureEnabled("auto.wash", { ...ga, vertical: "repair_auto" })).toBe(false);
    expect(isFeatureEnabled("auto.tires", { ...ga, vertical: "repair_auto" })).toBe(true);
    expect(isFeatureEnabled("auto.tires", { ...ga, vertical: "car_wash" })).toBe(false);
    expect(isFeatureEnabled("auto.vehicles", { ...ga, vertical: "car_wash" })).toBe(true);
    expect(isFeatureEnabled("auto.vehicles", { ...ga, vertical: "cafe" })).toBe(false);
    expect(isFeatureEnabled("auto.vehicles", { stage: "ga", plan: "free", vertical: "repair_auto" })).toBe(false);
  });
});
