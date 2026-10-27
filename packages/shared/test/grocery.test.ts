import { describe, expect, it } from "vitest";
import {
  PANTRY_LEAD_DAYS,
  gapsDays,
  gramsPerUnit,
  isGrocerSeasonId,
  isQurbaniName,
  per100gCents,
  per100gLabel,
  formatWeight,
  pantryInterval,
  pantryReminderDue,
  pantryRemindAt,
  portionPriceCents,
  rewardBackPct,
  upcomingGrocerSeasons,
  weighedLineCents,
} from "../src/grocery.js";
import { FEATURES, isFeatureEnabled } from "../src/plans.js";

const day = (n: number) => new Date(Date.UTC(2026, 0, 1) + n * 86_400_000).toISOString();

describe("weighed items", () => {
  it("prices a portion and a weigh-in at the per kg or per lb price", () => {
    expect(portionPriceCents(1399, "kg", 2000)).toBe(2798);
    expect(weighedLineCents(1399, "kg", 2140)).toBe(2994);
    expect(weighedLineCents(399, "lb", 2268)).toBe(1995);
    expect(gramsPerUnit("lb")).toBeCloseTo(453.59, 2);
  });
  it("shows weights in the shop's unit and a price per 100 g", () => {
    expect(formatWeight(2140, "kg")).toBe("2.14 kg");
    expect(formatWeight(2268, "lb")).toBe("5 lb");
    expect(per100gCents(1399, "kg")).toBeCloseTo(139.9, 1);
    expect(per100gCents(2199, "each", 9072)).toBeCloseTo(24.24, 2);
    expect(per100gCents(2199, "each")).toBeNull();
    expect(per100gLabel(137.4)).toBe("$1.37/100 g");
  });
});

describe("what a reward costs", () => {
  it("works out the share of spend given back", () => {
    expect(rewardBackPct(1, 1000, 500)).toBe(0.5);
    expect(rewardBackPct(2, 1000, 500)).toBe(1);
    expect(rewardBackPct(1, 100, 500)).toBe(5);
    expect(rewardBackPct(0, 1000, 500)).toBeNull();
  });
});

describe("pantry cadence", () => {
  it("uses the shop's default until there are two gaps, then the median of the last five", () => {
    expect(pantryInterval(40, [day(0)])).toBe(40);
    expect(pantryInterval(40, [day(0), day(30)])).toBe(40);
    expect(pantryInterval(40, [day(0), day(30), day(62)])).toBe(31);
    expect(gapsDays([day(30), day(0), day(62)])).toEqual([30, 32]);
    expect(pantryInterval(40, [day(0), day(20), day(41), day(200), day(221), day(242)])).toBe(21);
  });
  it("stays between a week and half a year", () => {
    expect(pantryInterval(2, [day(0)])).toBe(7);
    expect(pantryInterval(999, [day(0)])).toBe(180);
  });
  it("reminds 5 days before running out, once per purchase, and not forever", () => {
    expect(PANTRY_LEAD_DAYS).toBe(5);
    const bought = day(0);
    expect(pantryRemindAt(bought, 30).toISOString()).toBe(day(25));
    const e = { lastBoughtAt: bought, intervalDays: 30, lastRemindedAt: null as string | null };
    expect(pantryReminderDue(e, new Date(day(24)))).toBe(false);
    expect(pantryReminderDue(e, new Date(day(25)))).toBe(true);
    expect(pantryReminderDue({ ...e, lastRemindedAt: day(25) }, new Date(day(26)))).toBe(false);
    expect(pantryReminderDue({ ...e, lastRemindedAt: day(-40) }, new Date(day(26)))).toBe(true);
    expect(pantryReminderDue(e, new Date(day(61)))).toBe(false);
  });
});

describe("grocer seasons", () => {
  it("lists the festivals that fall in the window, soonest first, with the flyer date", () => {
    const s = upcomingGrocerSeasons("2027-01-10", 40);
    expect(s[0]!.id).toBe("lunar_new_year");
    expect(s[0]).toMatchObject({ daysUntil: 27, flyerFrom: "2027-01-23", flyerDue: false, qurbani: false, bookingsOpen: null });
    expect(upcomingGrocerSeasons("2027-01-25", 40)[0]!.flyerDue).toBe(true);
  });
  it("opens qurbani bookings eight weeks before Eid al-Adha", () => {
    const s = upcomingGrocerSeasons("2027-04-01", 120).find((x) => x.id === "eid_al_adha");
    expect(s?.qurbani).toBe(true);
    expect(s?.bookingsOpen).toBeTruthy();
  });
  it("knows its own season ids", () => {
    expect(isGrocerSeasonId("diwali")).toBe(true);
    expect(isGrocerSeasonId("nope")).toBe(false);
  });
});

describe("grocery features", () => {
  const defs = Object.values(FEATURES).filter((f) => f.key.startsWith("grocery."));
  it("has four Plus features that only grocers can see", () => {
    expect(defs.map((d) => d.key).sort()).toEqual(["grocery.counter_preorders", "grocery.flyer", "grocery.pantry_reminders", "grocery.whatsapp_orders"]);
    for (const d of defs) {
      expect(d.vertical).toBe("grocery");
      const ctx = { plan: "plus", stage: "ga", vertical: "grocery" } as never;
      expect(isFeatureEnabled(d.key, ctx)).toBe(true);
      expect(isFeatureEnabled(d.key, { ...(ctx as object), vertical: "cafe" } as never)).toBe(false);
    }
  });
});

describe("qurbani items", () => {
  it("knows a qurbani item by its name, in the shop's words and the community's", () => {
    for (const n of ["Whole goat, qurbani", "Cow share, qurbani (one of seven)", "Qurbani sheep", "Udhiyah goat", "قربانی کا بکرا", "कुर्बानी बकरा", "ਕੁਰਬਾਨੀ ਬੱਕਰਾ"]) expect(isQurbaniName(n), n).toBe(true);
    for (const n of ["Aqiqah goat", "Goat curry cut", "Atta 20 lb", "Whole chicken"]) expect(isQurbaniName(n), n).toBe(false);
  });
});
